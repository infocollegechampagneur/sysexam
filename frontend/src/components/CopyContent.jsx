import { fmtTime, wordCount } from "@/lib/tools";

export const answerText = (q, v) => (v === undefined || v === "" || (Array.isArray(v) && !v.length) ? "<em>(sans réponse)</em>" : q.type === "long" ? v : (Array.isArray(v) ? v : [v]).map((x) => String(x).replace(/</g, "&lt;")).join("<br/>"));

export const CopyContent = ({ exam, session, grade, per }) => {
  const g = grade || session.grade || {};
  const p = per || session.grade?.per_question || {};
  const ann = (session.annotations || []).filter((a) => a.text?.trim());
  return (
    <div className="space-y-5 text-slate-900" style={{ fontFamily: "Public Sans, sans-serif" }}>
      <div data-avoid-break="" style={{ borderBottom: "2px solid #1e3a8a", paddingBottom: 8, pageBreakAfter: "avoid" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{exam.title}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>Élève : <strong>{session.student_name}</strong> {session.student_number && `(${session.student_number})`}{session.teacher_name && ` — Enseignant : ${session.teacher_name}`} — Remis : {fmtTime(session.submitted_at)} — Infractions : {session.violations}</p>
        {g.score !== "" && g.score != null && <p style={{ margin: "4px 0 0", fontSize: 13 }}>Note : <strong>{g.score} / {g.max_score}</strong></p>}
      </div>
      {exam.questions.map((q, i) => (
        <div key={q.id} {...(q.type !== "long" ? { "data-avoid-break": "" } : {})} style={q.type !== "long" ? { breakInside: "avoid", pageBreakInside: "avoid" } : undefined}>
          <p data-avoid-break="" style={{ fontWeight: 600, margin: 0, pageBreakAfter: "avoid" }}>{i + 1}. {q.text} <span style={{ fontWeight: 400, color: "#64748b" }}>({q.points} pts)</span></p>
          <div style={{ margin: "6px 0", padding: "8px 12px", background: "#f1f5f9", borderRadius: 6 }} className="doc-html" dangerouslySetInnerHTML={{ __html: answerText(q, session.answers?.[q.id]) }} />
          {q.type === "long" && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 4px", textAlign: "right" }}>{wordCount(session.answers?.[q.id])} mots</p>}
          {(p[q.id]?.points !== undefined || p[q.id]?.comment) && <p style={{ fontSize: 13, color: "#1e3a8a", margin: 0 }}>Points : {p[q.id]?.points ?? "—"} {p[q.id]?.comment && `— ${p[q.id].comment}`}</p>}
        </div>
      ))}
      {exam.exam_type !== "form" && !(exam.doc_answer_mode === "inline" && exam.file?.kind === "pdf") && (
        <div style={{ marginTop: 12 }} data-testid="copy-essay-section">
          <div data-avoid-break="" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #1e3a8a", paddingBottom: 4, pageBreakAfter: "avoid" }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Production écrite</p>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1e3a8a", border: "1px solid #1e3a8a", borderRadius: 6, padding: "2px 8px" }} data-testid="copy-essay-words">{wordCount(session.essay_html)} mots</span>
          </div>
          {exam.writing_prompt && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", whiteSpace: "pre-wrap" }}>Sujet : {exam.writing_prompt}</p>}
          <div className="doc-html" style={{ marginTop: 6, padding: 12, border: "1px solid #cbd5e1", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: session.essay_html || "<em>(vide)</em>" }} />
        </div>
      )}
      {ann.length > 0 && (
        <div>
          <p style={{ fontWeight: 600, margin: 0 }}>Texte écrit dans le PDF</p>
          {ann.map((a) => <p key={a.id} data-avoid-break="" style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}><strong>Page {a.page + 1} :</strong> {a.text}</p>)}
        </div>
      )}
      {g.comment && <div data-avoid-break=""><p style={{ fontWeight: 600, margin: 0 }}>Commentaire de l'enseignant</p><p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{g.comment}</p></div>}
    </div>
  );
};
