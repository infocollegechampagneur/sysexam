import { useCallback, useEffect, useRef, useState } from "react";
import { TOOLS, COUNTED } from "@/lib/tools";

export function useAntiCheat({ active, settings, onEvent }) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [toolOpen, setToolOpen] = useState(null);
  const popupRef = useRef(null);
  const graceRef = useRef(0);
  const lastCountedRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const allowed = settings?.allowed_tools || [];
  const desktopAllowed = TOOLS.filter((t) => t.kind === "desktop" && allowed.includes(t.id)).map((t) => t.label);

  const toolActive = () => (popupRef.current && !popupRef.current.closed) || Date.now() < graceRef.current;

  const emit = useCallback((type, detail) => {
    if (COUNTED.has(type)) {
      if (Date.now() - lastCountedRef.current < 1500) return;
      lastCountedRef.current = Date.now();
    }
    onEventRef.current(type, detail);
  }, []);

  useEffect(() => {
    if (!active || !settings) return;
    const block = settings.block_clipboard;
    const names = { copy: "copier", cut: "couper", paste: "coller" };
    const onClip = (e) => { if (!block) return; e.preventDefault(); emit(`${e.type}_attempt`, `Tentative de ${names[e.type]}`); };
    const onCtx = (e) => { e.preventDefault(); emit("contextmenu", "Clic droit bloqué"); };
    const onDrag = (e) => e.preventDefault();
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k))) { e.preventDefault(); return emit("devtools", "Tentative d'ouvrir les outils de développement"); }
      if (e.key === "PrintScreen") { e.preventDefault(); return emit("print_attempt", "Tentative de capture d'écran"); }
      if (mod && ["p", "s", "u"].includes(k)) { e.preventDefault(); return emit("shortcut", `Raccourci bloqué : Ctrl+${k.toUpperCase()}`); }
      if (block && mod && ["c", "v", "x"].includes(k)) { e.preventDefault(); return emit("shortcut", `Raccourci bloqué : Ctrl+${k.toUpperCase()}`); }
      if (block && e.shiftKey && e.key === "Insert") { e.preventDefault(); return emit("shortcut", "Raccourci bloqué : Maj+Inser"); }
    };
    const onVis = () => {
      if (document.hidden) emit(toolActive() ? "tool_focus" : "tab_hidden", toolActive() ? "Fenêtre d'un outil web autorisé" : "Onglet ou fenêtre de l'examen quitté");
      else emit("returned", "Retour sur la page de l'examen");
    };
    const onBlur = () => setTimeout(() => {
      if (document.hidden || document.hasFocus()) return;
      if (document.activeElement?.tagName === "IFRAME") return;
      if (toolActive()) return emit("tool_focus", "Utilisation d'un outil web autorisé");
      if (desktopAllowed.length) return emit("external_focus", `Focus sur une autre application (permis : ${desktopAllowed.join(", ")})`);
      emit("window_blur", "La fenêtre de l'examen a perdu le focus");
    }, 250);
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
      window.removeEventListener("beforeprint", onPrint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings, emit]);

  const enterFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

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

  return { isFullscreen, enterFullscreen, openTool, closeTool, toolOpen };
}
