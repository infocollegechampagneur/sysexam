import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Users, FileDown, FileType2, Lock, ShieldAlert, ClipboardPaste, HandHelping } from "lucide-react";
import { useHelpRequests, HelpRequestRow } from "@/components/HelpBell";
import { SurveillanceReport } from "@/components/SurveillanceReport";
import { ClassControls } from "@/components/TeacherControls";
import { ClearSessionsButton } from "@/components/DeleteSessions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TeacherLayout } from "@/components/TeacherLayout";
import { SessionDetail } from "@/components/SessionDetail";
import { StatsPanel } from "@/components/StatsPanel";
import { CopyContent } from "@/components/CopyContent";
import { exportPdf, exportWord, slug } from "@/lib/exportUtils";
import { api, formatErr } from "@/lib/api";
import { SESSION_LABELS } from "@/lib/tools";

const DOT = { in_progress: "bg-blue-500", locked: "bg-rose-600", submitted: "bg-emerald-600" };

const SessionRow = ({ s, active, onClick, i }) => {
  const pastes = (s.events || []).filter((e) => e.type === "clipboard_tool" && e.suspect).length;
  return (
  <button onClick={onClick} data-testid={`monitoring-student-card-${i}`}
    className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"} ${s.status === "locked" ? "ring-1 ring-rose-300" : ""}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-medium text-slate-900">{s.student_name}</span>
      <span className="flex items-center gap-1">
        {pastes > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" title="Collage(s) de 40 mots ou plus" data-testid={`paste-badge-${i}`}><ClipboardPaste className="h-3 w-3" />{pastes}</span>}
        {s.violations > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">{s.violations}</span>}
      </span>
    </div>
    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${DOT[s.status]} ${s.status === "in_progress" ? "animate-pulse" : ""}`} />
      {SESSION_LABELS[s.status]}
      {s.grade?.score != null && <span className="ml-auto font-mono text-blue-900">{s.grade.score}/{s.grade.max_score}</span>}
    </div>
  </button>
  );
};

export default function Results() {
  const { id } = useParams();
  const nav = useNavigate();
  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("copies");
  const help = useHelpRequests(id);
  const lockedRef = useRef(null);
  const pasteRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/exams/${id}/sessions`).then((r) => {
      const locked = r.data.filter((s) => s.status === "locked");
      if (lockedRef.current) locked.filter((s) => !lockedRef.current.has(s.id)).forEach((s) => toast.error(`Examen bloqué : ${s.student_name} (${s.violations} signalements)`, { duration: 10000 }));
      lockedRef.current = new Set(locked.map((s) => s.id));
      const suspects = Object.fromEntries(r.data.map((s) => [s.id, (s.events || []).filter((e) => e.type === "clipboard_tool" && e.suspect).length]));
      if (pasteRef.current) r.data.forEach((s) => {
        const n = suspects[s.id] - (pasteRef.current[s.id] || 0);
        if (n > 0) {
          const ev = [...s.events].reverse().find((e) => e.type === "clipboard_tool" && e.suspect);
          toast.warning(`Collage important : ${s.student_name} a collé ${ev.words} mots d'un coup (${ev.similarity ?? 0} % déjà écrits)`, { duration: 12000, action: { label: "Voir", onClick: () => setSel(s.id) } });
        }
      });
      pasteRef.current = suspects;
      setSessions(r.data);
    }).catch((e) => toast.error(formatErr(e)));
  }, [id]);

  useEffect(() => {
    api.get(`/exams/${id}`).then((r) => setExam(r.data)).catch((e) => toast.error(formatErr(e)));
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [id, load]);

  const current = sessions.find((s) => s.id === sel);
  const counts = ["in_progress", "locked", "submitted"].map((k) => [k, sessions.filter((s) => s.status === k).length]);
  const groupRef = useRef(null);
  const reportRef = useRef(null);
  const groupName = `${slug(exam?.title)}_toutes_les_copies`;
  const groupExport = (fn) => { if (!sessions.length) return toast.error("Aucune copie à exporter"); fn(groupRef.current, groupName); };

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
        <Button size="sm" variant="outline" onClick={() => groupExport(exportPdf)} data-testid="export-all-pdf-btn"><FileDown className="mr-1.5 h-4 w-4" />Toutes (PDF)</Button>
        <Button size="sm" variant="outline" onClick={() => groupExport(exportWord)} data-testid="export-all-word-btn"><FileType2 className="mr-1.5 h-4 w-4" />Toutes (Word)</Button>
        <Button size="sm" onClick={() => { if (!sessions.length) return toast.error("Aucune copie"); exportPdf(reportRef.current, `${slug(exam?.title)}_rapport_surveillance`); }} className="bg-rose-700 hover:bg-rose-800" data-testid="export-surveillance-report-btn"><ShieldAlert className="mr-1.5 h-4 w-4" />Rapport de surveillance (PDF)</Button>
        {exam && <ClearSessionsButton exam={exam} sessions={sessions} onDone={() => { setSel(null); load(); }} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
        {counts.map(([k, n]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${DOT[k]}`} />{SESSION_LABELS[k]} : <strong data-testid={`count-${k}`}>{n}</strong></span>)}
      </div>
      {sessions.length > 0 && <ClassControls examId={id} exam={exam} sessions={sessions} onDone={() => { load(); api.get(`/exams/${id}`).then((r) => setExam(r.data)).catch(() => {}); }} />}
      {help.items.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4" data-testid="help-alert">
          <p className="flex items-center gap-2 font-semibold text-amber-900"><HandHelping className="h-4 w-4" />Élèves qui demandent de l'aide</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{help.items.map((h, i) => <HelpRequestRow key={h.id} h={h} i={i} onHandle={help.handle} />)}</div>
        </div>
      )}
      {sessions.some((s) => s.status === "locked") && (
        <div className="mt-4 rounded-xl border-2 border-rose-400 bg-rose-50 p-4" data-testid="locked-alert">
          <p className="flex items-center gap-2 font-semibold text-rose-800"><Lock className="h-4 w-4" />Examens bloqués en attente de votre décision</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sessions.filter((s) => s.status === "locked").map((s) => (
              <Button key={s.id} size="sm" variant="outline" onClick={() => setSel(s.id)} className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100" data-testid={`locked-alert-open-${s.id}`}>
                {s.student_name} · {s.violations} signalement(s) — voir l'historique
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit" data-testid="results-view-tabs">
        {[["copies", "Copies et surveillance"], ["stats", "Statistiques par question"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} data-testid={`results-tab-${k}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === k ? "bg-white text-blue-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>
      {view === "stats" && exam && <div className="mt-4"><StatsPanel examId={id} /></div>}
      {view === "copies" && <div className="mt-4 grid gap-6 lg:grid-cols-12">
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
      </div>}
      {exam && (
        <div className="fixed -left-[9999px] top-0 w-[760px] bg-white p-6" aria-hidden>
          <div ref={groupRef} className="export-root">
            {sessions.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="html2pdf__page-break" style={{ pageBreakBefore: "always", breakBefore: "page", height: 0, margin: 0 }} />}
                <CopyContent exam={exam} session={s} />
              </div>
            ))}
          </div>
          <div ref={reportRef} className="mt-10 export-root"><SurveillanceReport exam={exam} sessions={sessions} /></div>
        </div>
      )}
    </TeacherLayout>
  );
}
