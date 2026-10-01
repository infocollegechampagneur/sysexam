import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TeacherLayout } from "@/components/TeacherLayout";
import { SessionDetail } from "@/components/SessionDetail";
import { api, formatErr } from "@/lib/api";
import { SESSION_LABELS } from "@/lib/tools";

const DOT = { in_progress: "bg-blue-500", locked: "bg-rose-600", submitted: "bg-emerald-600" };

const SessionRow = ({ s, active, onClick, i }) => (
  <button onClick={onClick} data-testid={`monitoring-student-card-${i}`}
    className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"} ${s.status === "locked" ? "ring-1 ring-rose-300" : ""}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-medium text-slate-900">{s.student_name}</span>
      {s.violations > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">{s.violations}</span>}
    </div>
    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${DOT[s.status]} ${s.status === "in_progress" ? "animate-pulse" : ""}`} />
      {SESSION_LABELS[s.status]}
      {s.grade?.score != null && <span className="ml-auto font-mono text-blue-900">{s.grade.score}/{s.grade.max_score}</span>}
    </div>
  </button>
);

export default function Results() {
  const { id } = useParams();
  const nav = useNavigate();
  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sel, setSel] = useState(null);

  const load = useCallback(() => {
    api.get(`/exams/${id}/sessions`).then((r) => setSessions(r.data)).catch((e) => toast.error(formatErr(e)));
  }, [id]);

  useEffect(() => {
    api.get(`/exams/${id}`).then((r) => setExam(r.data)).catch((e) => toast.error(formatErr(e)));
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [id, load]);

  const current = sessions.find((s) => s.id === sel);
  const counts = ["in_progress", "locked", "submitted"].map((k) => [k, sessions.filter((s) => s.status === k).length]);

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/enseignant")} data-testid="results-back-btn"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Suivi en direct et correction</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" data-testid="results-exam-title">{exam?.title}</h1>
        </div>
        <span className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 font-mono font-bold tracking-[0.25em] text-blue-900" data-testid="results-exam-code">{exam?.code}</span>
        <Button variant="outline" size="sm" onClick={load} data-testid="results-refresh-btn"><RefreshCw className="mr-1.5 h-4 w-4" />Actualiser</Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
        {counts.map(([k, n]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${DOT[k]}`} />{SESSION_LABELS[k]} : <strong data-testid={`count-${k}`}>{n}</strong></span>)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <aside className="space-y-2 lg:col-span-4" data-testid="sessions-list">
          {sessions.map((s, i) => <SessionRow key={s.id} s={s} i={i} active={s.id === sel} onClick={() => setSel(s.id)} />)}
          {!sessions.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500" data-testid="sessions-empty">
              <Users className="mx-auto mb-2 h-6 w-6 text-slate-400" />Aucun élève n'a encore rejoint. Partagez le code <strong className="font-mono">{exam?.code}</strong>.
            </div>
          )}
        </aside>
        <section className="lg:col-span-8">
          {exam && current ? <SessionDetail exam={exam} session={current} onChanged={load} /> : (
            <div className="grid h-64 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">Sélectionnez une copie pour la consulter.</div>
          )}
        </section>
      </div>
    </TeacherLayout>
  );
}
