import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TOOLS } from "@/lib/tools";

export function useDesktopTools({ active, allowed, onEvent }) {
  const desktop = !!window.monExam?.runningTools;
  const ids = TOOLS.filter((t) => t.kind === "desktop" && allowed.includes(t.id)).map((t) => t.id);
  const key = ids.join(",");
  const [running, setRunning] = useState([]);
  const prev = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const label = (id) => TOOLS.find((t) => t.id === id)?.label || id;

  useEffect(() => {
    if (!desktop || !active || !key) return;
    const check = async () => {
      const now = (await window.monExam.runningTools()).filter((id) => key.split(",").includes(id));
      if (prev.current) {
        now.filter((id) => !prev.current.includes(id)).forEach((id) => onEventRef.current("tool_opened", `${label(id)} est ouvert sur le poste`));
        prev.current.filter((id) => !now.includes(id)).forEach((id) => onEventRef.current("tool_closed", `${label(id)} a été fermé`));
      } else if (now.length) {
        onEventRef.current("tool_opened", `Déjà ouvert(s) au début : ${now.map(label).join(", ")}`);
      }
      prev.current = now;
      setRunning(now);
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, [desktop, active, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const launch = useCallback(async (id) => {
    const r = await window.monExam.launchTool(id);
    if (r.ok) { toast.success(`Ouverture de ${label(id)}…`); onEventRef.current("tool_launch", `A ouvert ${label(id)} depuis l'examen`); }
    else toast.error(r.reason || `Impossible d'ouvrir ${label(id)}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { desktop, running, launch, desktopIds: ids };
}

export function useForbiddenApps({ active, onEvent }) {
  const seen = useRef(new Set());
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  useEffect(() => {
    if (!window.monExam?.forbiddenApps || !active) return;
    const check = async () => {
      const apps = await window.monExam.forbiddenApps();
      const now = new Set(apps.map((a) => a.label));
      apps.filter((a) => !seen.current.has(a.label)).forEach((a) =>
        onEventRef.current("forbidden_app", `Application interdite ouverte sur le poste : ${a.label} (fenêtre « ${a.title.slice(0, 80)} »)`));
      seen.current = now;
    };
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, [active]);
}
