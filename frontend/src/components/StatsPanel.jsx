import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, formatErr } from "@/lib/api";

const TYPE_LABELS = { mcq: "Choix multiple", short: "Réponse courte", long: "Développement" };
const rateColor = (r) => (r == null ? "bg-slate-300" : r >= 70 ? "bg-emerald-500" : r >= 40 ? "bg-amber-500" : "bg-rose-500");

const Bar = ({ value, max, color = "bg-blue-700" }) => (
  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${color}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>
);

const QuestionStat = ({ s, i }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`stat-question-${i}`}>
    <div className="flex flex-wrap items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-blue-900 font-mono text-sm font-bold text-white">{i + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{s.text}</p>
        <p className="mt-0.5 text-xs text-slate-500">{TYPE_LABELS[s.type]} · {s.points} pt(s) · {s.answered}/{s.total} réponse(s)</p>
      </div>
      <div className="text-right">
        <p className={`font-mono text-2xl font-bold ${s.success_rate == null ? "text-slate-400" : s.success_rate >= 70 ? "text-emerald-700" : s.success_rate >= 40 ? "text-amber-700" : "text-rose-700"}`} data-testid={`stat-rate-${i}`}>{s.success_rate == null ? "—" : `${s.success_rate} %`}</p>
        <p className="text-xs text-slate-500">{s.type === "mcq" && s.correct.length ? `${s.full_marks}/${s.graded} tout juste` : s.graded ? `moyenne sur ${s.graded} corrigée(s)` : "non corrigée"}</p>
      </div>
    </div>
    <div className="mt-3 flex items-center gap-3"><Bar value={s.success_rate || 0} max={100} color={rateColor(s.success_rate)} /></div>
    {s.distribution && (
      <div className="mt-4 space-y-1.5" data-testid={`stat-dist-${i}`}>
        {Object.entries(s.distribution).map(([o, n]) => {
          const good = s.correct.includes(o);
          return (
            <div key={o} className="flex items-center gap-3 text-sm">
              <span className={`w-44 truncate sm:w-64 ${good ? "font-semibold text-emerald-800" : "text-slate-700"}`} title={o}>{good ? "✓ " : ""}{o || <em>(vide)</em>}</span>
              <Bar value={n} max={s.answered} color={good ? "bg-emerald-500" : "bg-slate-400"} />
              <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-600">{n} · {s.answered ? Math.round((n / s.answered) * 100) : 0} %</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export const StatsPanel = ({ examId }) => {
  const [stats, setStats] = useState(null);
  const load = () => api.get(`/exams/${examId}/stats`).then((r) => setStats(r.data)).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stats) return <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>;
  const rates = stats.questions.filter((q) => q.success_rate != null).map((q) => q.success_rate);
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const sorted = [...stats.questions].filter((q) => q.success_rate != null).sort((a, b) => a.success_rate - b.success_rate);
  return (
    <div className="space-y-4" data-testid="stats-panel">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <BarChart3 className="h-5 w-5 text-blue-900" />
        <span className="text-sm text-slate-700"><strong data-testid="stats-total">{stats.total}</strong> élève(s) · <strong>{stats.submitted}</strong> remise(s)</span>
        <span className="text-sm text-slate-700">Réussite moyenne : <strong className="font-mono" data-testid="stats-avg">{avg == null ? "—" : `${avg} %`}</strong></span>
        {sorted.length > 1 && <span className="text-sm text-slate-700">Plus difficile : <strong>Q{stats.questions.indexOf(sorted[0]) + 1}</strong> ({sorted[0].success_rate} %) · Plus facile : <strong>Q{stats.questions.indexOf(sorted[sorted.length - 1]) + 1}</strong> ({sorted[sorted.length - 1].success_rate} %)</span>}
        <Button size="sm" variant="outline" className="ml-auto" onClick={load} data-testid="stats-refresh-btn"><RefreshCw className="mr-1.5 h-4 w-4" />Actualiser</Button>
      </div>
      {!stats.questions.length && <p className="py-10 text-center text-sm text-slate-500" data-testid="stats-empty">Cet examen ne contient aucune question.</p>}
      {stats.questions.map((s, i) => <QuestionStat key={s.id} s={s} i={i} />)}
      <p className="text-xs text-slate-500">Taux de réussite : choix multiples corrigés automatiquement (barème de l'examen) ; autres questions selon les points attribués lors de la correction.</p>
    </div>
  );
};
