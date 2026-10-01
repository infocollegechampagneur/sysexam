import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileType2, Unlock, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, formatErr } from "@/lib/api";
import { EVENT_LABELS, SESSION_LABELS, fmtTime, wordCount } from "@/lib/tools";
import { exportPdf, exportWord, slug } from "@/lib/exportUtils";

const Timeline = ({ events }) => (
  <ol className="max-h-80 space-y-2 overflow-y-auto pr-2" data-testid="session-timeline">
    {[...events].reverse().map((ev, i) => (
      <li key={i} className={`flex gap-3 rounded-lg border px-3 py-2 text-sm ${ev.counted ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
        <span className="shrink-0 font-mono text-xs text-slate-500">{new Date(ev.at).toLocaleTimeString("fr-CA")}</span>
        <span className={`shrink-0 font-medium ${ev.counted ? "text-rose-700" : "text-slate-700"}`}>{EVENT_LABELS[ev.type] || ev.type}</span>
        <span className="text-slate-500">{ev.detail}</span>
      </li>
    ))}
  </ol>
);

const answerText = (q, v) => (v === undefined || v === "" ? "<em>(sans réponse)</em>" : q.type === "long" ? v : String(v).replace(/</g, "&lt;"));

const CopyContent = ({ exam, session, grade, per }) => (
  <div className="space-y-5 text-slate-900" style={{ fontFamily: "Public Sans, sans-serif" }}>
    <div style={{ borderBottom: "2px solid #1e3a8a", paddingBottom: 8 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{exam.title}</h2>
      <p style={{ margin: "4px 0 0", fontSize: 13 }}>Élève : <strong>{session.student_name}</strong> {session.student_number && `(${session.student_number})`} — Remis : {fmtTime(session.submitted_at)} — Infractions : {session.violations}</p>
      {grade.score !== "" && grade.score != null && <p style={{ margin: "4px 0 0", fontSize: 13 }}>Note : <strong>{grade.score} / {grade.max_score}</strong></p>}
    </div>
    {exam.questions.map((q, i) => (
      <div key={q.id} style={{ breakInside: "avoid" }}>
        <p style={{ fontWeight: 600, margin: 0 }}>{i + 1}. {q.text} <span style={{ fontWeight: 400, color: "#64748b" }}>({q.points} pts)</span></p>
        <div style={{ margin: "6px 0", padding: "8px 12px", background: "#f1f5f9", borderRadius: 6 }} className="doc-html" dangerouslySetInnerHTML={{ __html: answerText(q, session.answers?.[q.id]) }} />
        {(per[q.id]?.points !== undefined || per[q.id]?.comment) && <p style={{ fontSize: 13, color: "#1e3a8a", margin: 0 }}>Points : {per[q.id]?.points ?? "—"} {per[q.id]?.comment && `— ${per[q.id].comment}`}</p>}
      </div>
    ))}
    {(exam.exam_type !== "form") && (
      <div>
        <p style={{ fontWeight: 600, margin: 0 }}>Rédaction ({wordCount(session.essay_html)} mots){exam.writing_prompt && ` — ${exam.writing_prompt}`}</p>
        <div className="doc-html" style={{ marginTop: 6, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: session.essay_html || "<em>(vide)</em>" }} />
      </div>
    )}
    {grade.comment && <div><p style={{ fontWeight: 600, margin: 0 }}>Commentaire de l'enseignant</p><p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{grade.comment}</p></div>}
  </div>
);

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

  const unlock = async () => {
    await api.post(`/sessions/${session.id}/unlock`).then(() => { toast.success("Copie déverrouillée"); onChanged(); }).catch((e) => toast.error(formatErr(e)));
  };

  const fname = `${slug(exam.title)}_${slug(session.student_name)}`;
  return (
    <div className="space-y-6" data-testid="session-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900" data-testid="session-detail-name">{session.student_name}</h2>
          <p className="text-sm text-slate-500">{session.student_number || "Sans matricule"} · {SESSION_LABELS[session.status]} · Début {fmtTime(session.started_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.status === "locked" && <Button onClick={unlock} className="bg-amber-600 hover:bg-amber-700" data-testid="unlock-session-btn"><Unlock className="mr-1.5 h-4 w-4" />Déverrouiller</Button>}
          <Button variant="outline" onClick={() => exportPdf(printRef.current, fname)} data-testid="export-pdf-report-btn"><FileDown className="mr-1.5 h-4 w-4" />PDF</Button>
          <Button variant="outline" onClick={() => exportWord(printRef.current, fname)} data-testid="export-word-report-btn"><FileType2 className="mr-1.5 h-4 w-4" />Word</Button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Journal de surveillance · <span className={session.violations ? "text-rose-700" : "text-emerald-700"} data-testid="session-violations-count">{session.violations} infraction(s)</span></p>
        <Timeline events={session.events || []} />
      </section>

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
        {exam.exam_type !== "form" && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-medium text-slate-900">Rédaction <span className="text-sm font-normal text-slate-500">({wordCount(session.essay_html)} mots)</span></p>
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
