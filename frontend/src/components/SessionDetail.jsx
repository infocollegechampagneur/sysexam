import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileType2, Unlock, Lock, Save, Loader2, Clock, FilePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CopyContent } from "@/components/CopyContent";
import { UnlockDialog } from "@/components/UnlockDialog";
import { ActivitySummary } from "@/components/ActivitySummary";
import { PasteHistory } from "@/components/PasteHistory";
import { SendMessageDialog, MessageStatus } from "@/components/SendMessageDialog";
import { LockSessionButton, ReopenSessionButton } from "@/components/TeacherControls";
import { PdfAnnotator } from "@/components/PdfAnnotator";
import { api, formatErr } from "@/lib/api";
import { EVENT_LABELS, SESSION_LABELS, fmtTime, wordCount } from "@/lib/tools";
import { exportPdf, exportWord, slug } from "@/lib/exportUtils";
import { downloadAnnotatedPdf } from "@/lib/pdf";

const Timeline = ({ events }) => {
  const [onlyFlags, setOnlyFlags] = useState(false);
  const list = [...events].reverse().filter((ev) => !onlyFlags || ev.counted || ["locked", "unlocked"].includes(ev.type));
  return (
    <>
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} data-testid="timeline-only-flags" />
        Afficher seulement les signalements
      </label>
      <ol className="max-h-80 space-y-2 overflow-y-auto pr-2" data-testid="session-timeline">
        {list.map((ev, i) => (
          <li key={i} className={`flex gap-3 rounded-lg border px-3 py-2 text-sm ${ev.type === "locked" ? "border-rose-400 bg-rose-100" : ev.counted ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
            <span className="shrink-0 font-mono text-xs text-slate-500">{new Date(ev.at).toLocaleTimeString("fr-CA")}</span>
            <span className={`shrink-0 font-medium ${ev.counted || ev.type === "locked" ? "text-rose-700" : "text-slate-700"}`}>{EVENT_LABELS[ev.type] || ev.type}</span>
            <span className="text-slate-500">{ev.detail}</span>
          </li>
        ))}
      </ol>
    </>
  );
};

const LockedBanner = ({ session, onUnlock }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-rose-400 bg-rose-50 p-4" data-testid="session-locked-banner">
    <Lock className="h-5 w-5 text-rose-600" />
    <p className="flex-1 text-sm text-rose-900">
      <strong>Examen bloqué</strong>{session.locked_at && ` à ${new Date(session.locked_at).toLocaleTimeString("fr-CA")}`} après {session.violations} signalement(s). Consultez l'historique ci-dessous, puis choisissez comment débloquer (signalements de plus ou compteur à zéro, avec un message à l'élève si vous le souhaitez).
    </p>
    <Button onClick={onUnlock} className="bg-rose-600 hover:bg-rose-700" data-testid="unlock-session-btn"><Unlock className="mr-1.5 h-4 w-4" />Débloquer l'examen</Button>
  </div>
);

const answerText = (q, v) => (v === undefined || v === "" ? "<em>(sans réponse)</em>" : q.type === "long" ? v : String(v).replace(/</g, "&lt;"));

const ExtraTime = ({ session, onChanged }) => {
  const [min, setMin] = useState(session.extra_minutes || 0);
  const save = () => api.put(`/sessions/${session.id}/extra-time`, { extra_minutes: Number(min) || 0 }).then(() => { toast.success("Temps supplémentaire mis à jour"); onChanged(); }).catch((e) => toast.error(formatErr(e)));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="extra-time-panel">
      <Clock className="h-4 w-4 text-blue-900" />
      <span className="text-slate-700">Temps supp. du plan d'intervention : <strong data-testid="extra-time-percent">{session.extra_time_percent || 0} %</strong></span>
      <span className="ml-auto text-slate-500">+ minutes accordées</span>
      <Input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} className="h-9 w-20" data-testid="extra-minutes-input" />
      <Button size="sm" variant="outline" onClick={save} data-testid="save-extra-minutes-btn">Appliquer</Button>
    </div>
  );
};

export const SessionDetail = ({ exam, session, onChanged }) => {
  const printRef = useRef(null);
  const qMax = useMemo(() => exam.questions.reduce((a, q) => a + Number(q.points || 0), 0), [exam]);
  const [per, setPer] = useState({});
  const [grade, setGrade] = useState({ score: "", max_score: qMax || 100, comment: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const g = session.grade;
    setPer(g?.per_question || {});
    setGrade({ score: g?.score ?? "", max_score: g?.max_score ?? (qMax || 100), comment: g?.comment || "" });
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setQ = (qid, k, v) => {
    const next = { ...per, [qid]: { ...per[qid], [k]: v } };
    setPer(next);
    if (k === "points" && exam.exam_type === "form") setGrade((g) => ({ ...g, score: Object.values(next).reduce((a, x) => a + (Number(x.points) || 0), 0) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/sessions/${session.id}/grade`, { score: grade.score === "" ? null : Number(grade.score), max_score: Number(grade.max_score), comment: grade.comment, per_question: per });
      toast.success("Correction enregistrée");
      onChanged();
    } catch (e) { toast.error(formatErr(e)); } finally { setSaving(false); }
  };

  const [unlockOpen, setUnlockOpen] = useState(false);
  const unlock = () => setUnlockOpen(true);

  const fname = `${slug(exam.title)}_${slug(session.student_name)}`;
  const inlinePdf = exam.exam_type === "document" && exam.doc_answer_mode === "inline" && exam.file?.kind === "pdf";
  const fetchBlob = useCallback(() => api.get(`/exams/${exam.id}/file`, { responseType: "blob" }).then((r) => r.data), [exam.id]);
  const annotated = () => fetchBlob().then((b) => downloadAnnotatedPdf(b, session.annotations || [], `${fname}_annote`)).catch(() => toast.error("Export du PDF annoté impossible"));
  return (
    <div className="space-y-6" data-testid="session-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900" data-testid="session-detail-name">{session.student_name}</h2>
          <p className="text-sm text-slate-500">{session.student_number || "Sans matricule"} · {session.client === "desktop" ? "Application Windows · " : "Navigateur web · "}{session.teacher_name ? `Enseignant : ${session.teacher_name} · ` : ""}{SESSION_LABELS[session.status]} · Début {fmtTime(session.started_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.status === "in_progress" && <SendMessageDialog session={session} onDone={onChanged} />}
          {session.status === "in_progress" && <LockSessionButton session={session} onDone={onChanged} />}
          {session.status === "submitted" && <ReopenSessionButton session={session} onDone={onChanged} />}
          {session.status === "locked" && <Button onClick={unlock} variant="outline" className="border-rose-300 text-rose-700" data-testid="unlock-session-top-btn"><Unlock className="mr-1.5 h-4 w-4" />Débloquer</Button>}
          <Button variant="outline" onClick={() => exportPdf(printRef.current, fname)} data-testid="export-pdf-report-btn"><FileDown className="mr-1.5 h-4 w-4" />PDF</Button>
          <Button variant="outline" onClick={() => exportWord(printRef.current, fname)} data-testid="export-word-report-btn"><FileType2 className="mr-1.5 h-4 w-4" />Word</Button>
          {inlinePdf && <Button variant="outline" onClick={annotated} data-testid="export-annotated-pdf-btn"><FilePen className="mr-1.5 h-4 w-4" />PDF annoté</Button>}
        </div>
      </div>

      {session.status === "locked" && <LockedBanner session={session} onUnlock={unlock} />}
      <UnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} session={session} maxViolations={exam.settings.max_violations} onDone={onChanged} />
      {exam.duration_minutes > 0 && <ExtraTime key={session.id} session={session} onChanged={onChanged} />}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Historique de l'élève · <span className={session.violations ? "text-rose-700" : "text-emerald-700"} data-testid="session-violations-count">{session.violations} / {exam.settings.max_violations + (session.allowance || 0)} signalement(s)</span></p>
        <ActivitySummary events={session.events || []} />
        <div className="mb-2"><MessageStatus msg={session.teacher_message} /></div>
        <Timeline events={session.events || []} />
      </section>
      <PasteHistory events={session.events} />

      <section className="space-y-4">
        {exam.questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`grade-question-${i}`}>
            <p className="font-medium text-slate-900">{i + 1}. {q.text} <span className="text-sm font-normal text-slate-500">({q.points} pts)</span></p>
            <div className="doc-html mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: answerText(q, session.answers?.[q.id]) }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Input type="number" step={0.5} placeholder="Points" value={per[q.id]?.points ?? ""} onChange={(e) => setQ(q.id, "points", e.target.value === "" ? undefined : Number(e.target.value))} className="w-28" data-testid={`grade-points-${i}`} />
              <Input placeholder="Commentaire" value={per[q.id]?.comment || ""} onChange={(e) => setQ(q.id, "comment", e.target.value)} className="flex-1" data-testid={`grade-comment-${i}`} />
            </div>
          </div>
        ))}
        {inlinePdf && (
          <div>
            <p className="mb-2 font-medium text-slate-900">Document complété par l'élève</p>
            <PdfAnnotator key={session.id} fetchBlob={fetchBlob} annotations={session.annotations || []} readOnly />
          </div>
        )}
        {exam.exam_type !== "form" && !inlinePdf && (
          <div className="rounded-xl border-2 border-blue-900/20 bg-white p-4" data-testid="grade-essay-section">
            <div className="flex items-center justify-between">
              <p className="font-display font-semibold text-slate-900">Production écrite</p>
              <span className="rounded-md border border-blue-900 px-2 py-0.5 font-mono text-sm font-bold text-blue-900" data-testid="grade-essay-words">{wordCount(session.essay_html)} mots</span>
            </div>
            {exam.writing_prompt && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">Sujet : {exam.writing_prompt}</p>}
            <div className="doc-html mt-2 rounded-md border border-slate-200 p-4" data-testid="grade-essay" dangerouslySetInnerHTML={{ __html: session.essay_html || "<em>(vide)</em>" }} />
          </div>
        )}
      </section>

      <section className="rounded-xl border-2 border-blue-900/20 bg-white p-5">
        <p className="font-display font-semibold text-slate-900">Note finale</p>
        <div className="mt-3 flex items-center gap-2">
          <Input type="number" step={0.5} value={grade.score} onChange={(e) => setGrade({ ...grade, score: e.target.value })} className="w-28" data-testid="grade-score-input" />
          <span className="text-slate-500">/</span>
          <Input type="number" value={grade.max_score} onChange={(e) => setGrade({ ...grade, max_score: e.target.value })} className="w-28" data-testid="grade-max-input" />
        </div>
        <Textarea rows={3} placeholder="Commentaire général" value={grade.comment} onChange={(e) => setGrade({ ...grade, comment: e.target.value })} className="mt-3" data-testid="grade-general-comment" />
        <Button onClick={save} disabled={saving} className="mt-3 bg-blue-900 hover:bg-blue-800" data-testid="save-grade-btn">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" />Enregistrer la correction</>}
        </Button>
      </section>

      <div className="fixed -left-[9999px] top-0 w-[760px] bg-white p-6" aria-hidden>
        <div ref={printRef}><CopyContent exam={exam} session={session} grade={grade} per={per} /></div>
      </div>
    </div>
  );
};
