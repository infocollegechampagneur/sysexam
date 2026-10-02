import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PreCheck = ({ onClean }) => {
  const [apps, setApps] = useState(null);
  const [busy, setBusy] = useState(false);
  const scan = useCallback(async () => {
    const list = await window.monExam.forbiddenApps();
    setApps(list);
    onClean?.(list.length === 0);
  }, [onClean]);
  useEffect(() => { scan(); const iv = setInterval(scan, 4000); return () => clearInterval(iv); }, [scan]);
  const closeAll = async () => {
    setBusy(true);
    const r = await window.monExam.closeForbidden();
    setApps(r.remaining);
    onClean?.(r.remaining.length === 0);
    setBusy(false);
  };
  if (apps === null) return <p className="mt-6 flex items-center gap-2 text-sm text-slate-400" data-testid="precheck-loading"><Loader2 className="h-4 w-4 animate-spin" />Vérification des applications ouvertes…</p>;
  if (!apps.length) return <p className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200" data-testid="precheck-ok"><CheckCircle2 className="h-4 w-4" />Aucune application interdite n'est ouverte. Vous pouvez commencer.</p>;
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
