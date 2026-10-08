import { useEffect, useMemo, useState } from "react";
import { Monitor, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatErr } from "@/lib/api";
import { TOOLS } from "@/lib/tools";

const DESKTOP = TOOLS.filter((t) => t.kind === "desktop");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—");

const ToolCell = ({ t }) => {
  if (!t) return <span className="text-slate-400">—</span>;
  return <span className={t.installed ? "text-emerald-700" : "font-medium text-rose-700"} title={t.path || ""}>{t.installed ? "✓ trouvé" : "✗ absent"}</span>;
};

export const DevicesPanel = () => {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const load = () => api.get("/admin/devices").then((r) => setRows(r.data)).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); }, []);
  const list = useMemo(() => (rows || []).filter((d) => {
    if (filter !== "all" && !(d.tools?.[filter] && !d.tools[filter].installed)) return false;
    const s = q.trim().toLowerCase();
    return !s || [d.hostname, d.user, d.student_name, d.exam_title].some((v) => (v || "").toLowerCase().includes(s));
  }), [rows, q, filter]);
  if (!rows) return <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>;
  const missingCount = (id) => rows.filter((d) => d.tools?.[id] && !d.tools[id].installed).length;
  return (
    <div className="space-y-4" data-testid="devices-panel">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <Monitor className="h-5 w-5 text-blue-900" />
        <span className="text-sm text-slate-700"><strong data-testid="devices-count">{rows.length}</strong> poste(s) vu(s) via l'application Windows</span>
        <div className="relative ml-auto min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Poste, utilisateur, élève, examen…" className="bg-white pl-8" data-testid="devices-search" />
        </div>
        <Button size="sm" variant="outline" onClick={load} data-testid="devices-refresh-btn"><RefreshCw className="mr-1.5 h-4 w-4" />Actualiser</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1 text-xs ${filter === "all" ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600"}`} data-testid="devices-filter-all">Tous</button>
        {DESKTOP.map((t) => <button key={t.id} type="button" onClick={() => setFilter(t.id)} className={`rounded-full border px-3 py-1 text-xs ${filter === t.id ? "border-rose-700 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600"}`} data-testid={`devices-filter-${t.id}`}>{t.label} manquant ({missingCount(t.id)})</button>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Poste</th><th className="px-3 py-2">Utilisateur</th><th className="px-3 py-2">Version</th>{DESKTOP.map((t) => <th key={t.id} className="px-3 py-2">{t.label}</th>)}<th className="px-3 py-2">Dernière vérification</th><th className="px-3 py-2">Élève / examen</th><th className="px-3 py-2">Apps fermées</th></tr>
          </thead>
          <tbody>
            {!list.length && <tr><td colSpan={7 + DESKTOP.length} className="px-3 py-8 text-center text-slate-500" data-testid="devices-empty">Aucun poste.</td></tr>}
            {list.map((d, i) => (
              <tr key={d.hostname} className="border-t border-slate-100" data-testid={`device-row-${i}`}>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900">{d.hostname || "?"}</td>
                <td className="px-3 py-2 text-slate-700">{d.user || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{d.app_version || "—"}</td>
                {DESKTOP.map((t) => <td key={t.id} className="px-3 py-2"><ToolCell t={d.tools?.[t.id]} /></td>)}
                <td className="px-3 py-2 text-xs text-slate-600">{fmt(d.checked_at)}{d.checks > 1 && <span className="text-slate-400"> · {d.checks}×</span>}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{d.student_name}<br /><span className="text-slate-400">{d.exam_title}</span></td>
                <td className="px-3 py-2 text-xs text-slate-600">{(d.forbidden_closed || []).join(", ") || "—"}{d.forbidden_remaining?.length ? <span className="text-rose-700"> · restantes : {d.forbidden_remaining.join(", ")}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Survolez « ✓ trouvé » pour voir le chemin de l'exécutable. Les chemins personnalisés se règlent dans l'onglet « Alertes d'aide ».</p>
    </div>
  );
};
