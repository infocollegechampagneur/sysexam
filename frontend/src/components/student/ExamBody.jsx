import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RichEditor } from "@/components/RichEditor";
import { DocumentViewer } from "@/components/DocumentViewer";
import { PdfAnnotator } from "@/components/PdfAnnotator";
import { wordCount } from "@/lib/tools";

const QuestionBlock = ({ q, i, value, onChange, spellcheck, allowPaste, antidote }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-6" data-testid={`exam-question-${i}`}>
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-blue-900 font-mono text-sm font-bold text-white">{i + 1}</span>
      <p className="flex-1 whitespace-pre-wrap font-medium text-slate-900">{q.text}</p>
      <span className="shrink-0 text-xs text-slate-500">{q.points} pt{q.points > 1 ? "s" : ""}</span>
    </div>
    <div className="mt-4 pl-10">
      {q.type === "mcq" && (
        <RadioGroup value={value ?? ""} onValueChange={onChange} className="space-y-2">
          {q.options.map((o, j) => (
            <label key={j} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${value === o ? "border-blue-900 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
              <RadioGroupItem value={o} data-testid={`exam-question-${i}-option-${j}`} />
              <span className="text-slate-800">{o}</span>
            </label>
          ))}
        </RadioGroup>
      )}
      {q.type === "short" && <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} spellCheck={spellcheck} autoComplete="off" data-answer-zone="" data-testid={`exam-question-${i}-input`} />}
      {q.type === "long" && <RichEditor value={value} onChange={onChange} spellcheck={spellcheck} allowPaste={allowPaste} antidote={antidote} minHeight={160} testId={`exam-question-${i}-editor`} />}
    </div>
  </div>
);

export const ExamBody = ({ exam, answers, setAnswer, essay, setEssay, fetchBlob, annotations, setAnnotations, desktopTools, onEvent }) => {
  const sc = exam.settings.browser_spellcheck;
  const tools = exam.settings.allowed_tools || [];
  const allowPaste = tools.some((t) => ["antidote", "wordq", "lexibar"].includes(t));
  const antidote = tools.includes("antidote") ? {
    onCorrect: (text) => {
      onEvent?.("antidote_correct", `A envoyé ${(text.match(/\S+/g) || []).length} mot(s) vers Antidote pour correction`);
      if (desktopTools?.desktop) desktopTools.launch("antidote");
    },
  } : null;
  const inline = exam.exam_type === "document" && exam.doc_answer_mode === "inline" && !!exam.file;
  const inlinePdf = inline && exam.file.kind === "pdf";
  const hasEssay = exam.exam_type !== "form" && !inlinePdf;
  const hasDoc = !!exam.file && !inline;
  const split = hasDoc && exam.exam_type === "document";
  return (
    <div className={`mx-auto px-4 py-8 ${split || inlinePdf ? "max-w-[1600px]" : "max-w-4xl"}`}>
      {inlinePdf && <div className="mb-6"><PdfAnnotator fetchBlob={fetchBlob} annotations={annotations} onChange={setAnnotations} /></div>}
      <div className={split ? "grid gap-6 lg:grid-cols-2" : "mx-auto max-w-4xl space-y-6"}>
        {hasDoc && <div className={split ? "lg:sticky lg:top-24 lg:self-start" : ""}><DocumentViewer file={exam.file} fetchBlob={fetchBlob} height={split ? "calc(100vh - 140px)" : "60vh"} /></div>}
        <div className="space-y-6">
          {exam.questions.map((q, i) => (
            <QuestionBlock key={q.id} q={q} i={i} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} spellcheck={sc} allowPaste={allowPaste} antidote={antidote} />
          ))}
          {hasEssay && (
            <div className="rounded-xl border border-slate-200 bg-white p-6" data-testid="exam-essay-block">
              {exam.writing_prompt && <p className="mb-4 whitespace-pre-wrap font-medium text-slate-900">{exam.writing_prompt}</p>}
              <RichEditor value={essay} onChange={setEssay} spellcheck={sc} allowPaste={allowPaste} antidote={antidote} minHeight={exam.exam_type === "redaction" || inline ? 480 : 300} testId="exam-rich-editor" />
              <p className="mt-2 text-right text-xs text-slate-500" data-testid="essay-word-count">{wordCount(essay)} mots</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
