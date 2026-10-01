import { useCallback, useEffect, useRef, useState } from "react";
import { TOOLS, COUNTED } from "@/lib/tools";

export function useAntiCheat({ active, settings, onEvent }) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [toolOpen, setToolOpen] = useState(null);
  const popupRef = useRef(null);
  const graceRef = useRef(0);
  const lastCountedRef = useRef({});
  const awayRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const allowed = settings?.allowed_tools || [];
  const desktopAllowed = TOOLS.filter((t) => t.kind === "desktop" && allowed.includes(t.id)).map((t) => t.label);

  const toolActive = () => (popupRef.current && !popupRef.current.closed) || Date.now() < graceRef.current;

  const emit = useCallback((type, detail) => {
    if (COUNTED.has(type)) {
      const last = lastCountedRef.current[type] || 0;
      if (Date.now() - last < 1500) return;
      lastCountedRef.current[type] = Date.now();
    }
    onEventRef.current(type, detail);
  }, []);

  useEffect(() => {
    if (!active || !settings) return;
    const block = settings.block_clipboard;
    const onClip = (e) => {
      if (!block) return;
      e.preventDefault();
      const sel = window.getSelection();
      const inToast = sel?.anchorNode?.parentElement?.closest?.("[data-sonner-toaster]");
      const content = e.type === "paste" ? e.clipboardData?.getData("text") : inToast ? "" : String(sel || "");
      const snippet = (content || "").trim().replace(/\s+/g, " ").slice(0, 160);
      const label = { copy: "A tenté de copier", cut: "A tenté de couper", paste: "A tenté de coller" }[e.type];
      emit(`${e.type}_attempt`, snippet ? `${label} : « ${snippet}${content.length > 160 ? "…" : ""} »` : `${label} (aucun texte)`);
    };
    const onCtx = (e) => { e.preventDefault(); emit("contextmenu", "Clic droit bloqué"); };
    const onDrag = (e) => e.preventDefault();
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k))) { e.preventDefault(); return emit("devtools", "A tenté d'ouvrir les outils de développement du navigateur"); }
      if (e.key === "PrintScreen") { e.preventDefault(); return emit("print_attempt", "A tenté une capture d'écran"); }
      if (mod && ["p", "s", "u"].includes(k)) { e.preventDefault(); return emit("shortcut", `Raccourci bloqué : Ctrl+${k.toUpperCase()} (${{ p: "imprimer", s: "enregistrer la page", u: "voir le code source" }[k]})`); }
    };
    const leave = (type, detail) => { if (!awayRef.current) awayRef.current = { at: Date.now(), type }; emit(type, detail); };
    const back = () => {
      if (!awayRef.current) return;
      const secs = (Date.now() - awayRef.current.at) / 1000;
      const where = { tab_hidden: "un autre onglet, site web ou fenêtre", window_blur: "une autre application ou fenêtre", external_focus: "un logiciel permis", tool_focus: "un outil web autorisé" }[awayRef.current.type] || "ailleurs";
      awayRef.current = null;
      onEventRef.current("returned", `Retour dans l'examen après ${Math.round(secs)} s passées sur ${where}`, secs);
    };
    const onVis = () => {
      if (!document.hidden) return back();
      if (toolActive()) leave("tool_focus", "Est allé sur un outil web autorisé");
      else leave("tab_hidden", "A quitté la page de l'examen (autre onglet, autre site web ou fenêtre réduite)");
    };
    const onBlur = () => setTimeout(() => {
      if (document.hidden || document.hasFocus()) return;
      if (document.activeElement?.tagName === "IFRAME") return;
      if (toolActive()) return leave("tool_focus", "Est allé sur un outil web autorisé");
      if (desktopAllowed.length) return leave("external_focus", `A utilisé une autre application (logiciels permis : ${desktopAllowed.join(", ")})`);
      leave("window_blur", "A cliqué dans une autre fenêtre ou application (Alt+Tab, autre logiciel, autre écran)");
    }, 250);
    const onFocus = () => back();
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs && settings.require_fullscreen) emit(toolActive() ? "fullscreen_exit_tool" : "fullscreen_exit", toolActive() ? "Sortie du plein écran pour un outil autorisé" : "Sortie du mode plein écran");
    };
    const onPrint = () => emit("print_attempt", "Tentative d'impression");
    document.addEventListener("copy", onClip, true);
    document.addEventListener("cut", onClip, true);
    document.addEventListener("paste", onClip, true);
    document.addEventListener("contextmenu", onCtx, true);
    document.addEventListener("dragstart", onDrag, true);
    document.addEventListener("drop", onDrag, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeprint", onPrint);
    return () => {
      document.removeEventListener("copy", onClip, true);
      document.removeEventListener("cut", onClip, true);
      document.removeEventListener("paste", onClip, true);
      document.removeEventListener("contextmenu", onCtx, true);
      document.removeEventListener("dragstart", onDrag, true);
      document.removeEventListener("drop", onDrag, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", onPrint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings, emit]);

  const enterFullscreen = () => {
    if (window.monExam?.isDesktop) return window.monExam.setLockdown(true, { desktopTools: allowed.filter((id) => TOOLS.find((t) => t.id === id)?.kind === "desktop") });
    return document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const openTool = (tool) => {
    graceRef.current = Date.now() + 3000;
    const w = Math.min(760, window.screen.availWidth / 2);
    popupRef.current = window.open(tool.url, `outil_${tool.id}`, `popup=yes,width=${w},height=${window.screen.availHeight - 80},left=${window.screen.availWidth - w},top=0`);
    setToolOpen(tool.id);
    onEventRef.current("tool_focus", `Ouverture de l'outil autorisé : ${tool.label}`);
    const iv = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        clearInterval(iv);
        graceRef.current = Date.now() + 1500;
        setToolOpen(null);
      }
    }, 800);
  };

  const closeTool = () => popupRef.current?.close();

  return { isFullscreen: window.monExam?.isDesktop ? true : isFullscreen, enterFullscreen, openTool, closeTool, toolOpen };
}
