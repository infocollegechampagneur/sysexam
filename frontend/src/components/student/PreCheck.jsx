import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TOOLS } from "@/lib/tools";

export const PreCheck = ({ onClean, sapi, allowedTools = [] }) => {
  const [apps, setApps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState(null);
  const scanning = useRef(false);
  const closed = useRef([]);
  const reported = useRef(false);
  const report = useCallback(async (list) => {
    if (reported.current || !sapi || !window.monExam?.installedTools) return;
    reported.current = true;
    try {
      if (window.monExam.setToolPaths) { try { const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/tool-paths`); await window.monExam.setToolPaths(await r.json()); } catch (e) { /* défauts */ } }
      const [inst, info] = await Promise.all([window.monExam.installedTools(), window.monExam.machineInfo ? window.monExam.machineInfo() : {}]);
      setTools(inst);
      await sapi.post("/student/device", { ...info, tools: inst, forbidden_closed: closed.current, forbidden_remaining: list.map((a) => a.label) });
    } catch (e) { reported.current = false; }
  }, [sapi]);
  const scan = useCallback(async () => {
    if (scanning.current) return;
    scanning.current = true;
    try {
      const list = await window.monExam.forbiddenApps();
      setApps(list);
      onClean?.(list.length === 0);
      report(list);
    } finally { scanning.current = false; }
  }, [onClean, report]);
  useEffect(() => { scan(); const iv = setInterval(scan, 6000); return () => clearInterval(iv); }, [scan]);
  const closeAll = async () => {
    setBusy(true);
    try {
      const before = (apps || []).map((a) => a.label);
      const r = await Promise.race([window.monExam.closeForbidden(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000))]);
      closed.current = [...new Set([...closed.current, ...before.filter((l) => !r.remaining.some((a) => a.label === l))])];
      reported.current = false;
      setApps(r.remaining);
      onClean?.(r.remaining.length === 0);
      report(r.remaining);
      if (r.remaining.length) toast.warning(`Impossible de fermer : ${r.remaining.map((a) => a.label).join(", ")}. Fermez-les manuellement puis cliquez « Revérifier ».`, { duration: 10000 });
    } catch (e) {
      toast.error("La fermeture prend trop de temps. Fermez les applications manuellement puis cliquez « Revérifier ».");
      scan();
    } finally { setBusy(false); }
  };
  const toolsLine = tools && allowedTools.length ? (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400" data-testid="precheck-tools">
      {allowedTools.map((id) => <span key={id} className={tools[id]?.installed ? "text-emerald-300" : "text-amber-300"} data-testid={`precheck-tool-${id}`}>{tools[id]?.installed ? "✓" : "✗"} {TOOLS.find((t) => t.id === id)?.label || id}{!tools[id]?.installed && " (non trouvé)"}</span>)}
    </p>
  ) : null;
  if (apps === null) return <p className="mt-6 flex items-center gap-2 text-sm text-slate-400" data-testid="precheck-loading"><Loader2 className="h-4 w-4 animate-spin" />Vérification des applications ouvertes…</p>;
  if (!apps.length) return <div className="mt-6"><p className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200" data-testid="precheck-ok"><CheckCircle2 className="h-4 w-4" />Aucune application interdite n'est ouverte. Vous pouvez commencer.</p>{toolsLine}</div>;
  return (
    <div className="mt-6 rounded-xl border border-rose-800 bg-rose-950/30 p-5" data-testid="precheck-forbidden">
      <p className="flex items-center gap-2 font-semibold text-rose-200"><Ban className="h-4 w-4" />Fermez ces applications avant de commencer</p>
      <ul className="mt-3 space-y-1.5 text-sm text-rose-100/90">
        {apps.map((a) => <li key={a.label} className="flex items-center gap-2" data-testid={`precheck-app-${a.label}`}><XCircle className="h-4 w-4 shrink-0 text-rose-400" /><span className="font-medium">{a.label}</span><span className="truncate text-xs text-rose-300/70">{a.title}</span></li>)}
      </ul>
      <p className="mt-3 text-xs text-rose-200/80">Ces applications seraient signalées comme infraction pendant l'examen. Le bouton ci-dessous les ferme pour vous (les documents non enregistrés dans ces applications seront perdus).</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={closeAll} disabled={busy} className="bg-rose-600 hover:bg-rose-500" data-testid="precheck-close-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Ban className="mr-1.5 h-4 w-4" />Fermer automatiquement</>}</Button>
        <Button variant="outline" onClick={scan} className="border-rose-700 bg-transparent text-rose-200 hover:bg-rose-900/40 hover:text-white" data-testid="precheck-rescan-btn"><RefreshCw className="mr-1.5 h-4 w-4" />Revérifier</Button>
      </div>
    </div>
  );
};
