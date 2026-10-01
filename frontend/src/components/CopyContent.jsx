import { fmtTime, wordCount } from "@/lib/tools";

export const answerText = (q, v) => (v === undefined || v === "" ? "<em>(sans réponse)</em>" : q.type === "long" ? v : String(v).replace(/</g, "&lt;"));

export const CopyContent = ({ exam, session, grade, per }) => {
  const g = grade || session.grade || {};
  const p = per || session.grade?.per_question || {};
  const ann = (session.annotations || []).filter((a) => a.text?.trim());
  return (
    <div className="space-y-5 text-slate-900" style={{ fontFamily: "Public Sans, sans-serif" }}>
      <div style={{ borderBottom: "2px solid #1e3a8a", paddingBottom: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{exam.title}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>Élève : <strong>{session.student_name}</strong> {session.student_number && `(${session.student_number})`} — Remis : {fmtTime(session.submitted_at)} — Infractions : {session.violations}</p>
        {g.score !== "" && g.score != null && <p style={{ margin: "4px 0 0", fontSize: 13 }}>Note : <strong>{g.score} / {g.max_score}</strong></p>}
      </div>
      {exam.questions.map((q, i) => (
        <div key={q.id} style={{ breakInside: "avoid" }}>
          <p style={{ fontWeight: 600, margin: 0 }}>{i + 1}. {q.text} <span style={{ fontWeight: 400, color: "#64748b" }}>({q.points} pts)</span></p>
          <div style={{ margin: "6px 0", padding: "8px 12px", background: "#f1f5f9", borderRadius: 6 }} className="doc-html" dangerouslySetInnerHTML={{ __html: answerText(q, session.answers?.[q.id]) }} />
          {(p[q.id]?.points !== undefined || p[q.id]?.comment) && <p style={{ fontSize: 13, color: "#1e3a8a", margin: 0 }}>Points : {p[q.id]?.points ?? "—"} {p[q.id]?.comment && `— ${p[q.id].comment}`}</p>}
        </div>
      ))}
      {exam.exam_type !== "form" && !(exam.doc_answer_mode === "inline" && exam.file?.kind === "pdf") && (
        <div>
          <p style={{ fontWeight: 600, margin: 0 }}>Rédaction ({wordCount(session.essay_html)} mots){exam.writing_prompt && ` — ${exam.writing_prompt}`}</p>
          <div className="doc-html" style={{ marginTop: 6, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: session.essay_html || "<em>(vide)</em>" }} />
        </div>
      )}
      {ann.length > 0 && (
        <div>
          <p style={{ fontWeight: 600, margin: 0 }}>Texte écrit dans le PDF</p>
          {ann.map((a) => <p key={a.id} style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}><strong>Page {a.page + 1} :</strong> {a.text}</p>)}
        </div>
      )}
      {g.comment && <div><p style={{ fontWeight: 600, margin: 0 }}>Commentaire de l'enseignant</p><p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{g.comment}</p></div>}
    </div>
  );
};
