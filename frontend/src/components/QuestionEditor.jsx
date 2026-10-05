import { Plus, Trash2, ArrowUp, ArrowDown, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const QTYPES = { mcq: "Choix multiple", short: "Réponse courte", long: "Développement" };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const QuestionCard = ({ q, i, total, update, remove, move }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`question-card-${i}`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-900 font-mono text-sm font-bold text-white">{i + 1}</span>
      <Select value={q.type} onValueChange={(v) => update({ ...q, type: v, options: v === "mcq" ? (q.options.length ? q.options : ["", ""]) : [] })}>
        <SelectTrigger className="h-8 w-44" data-testid={`question-type-select-${i}`}><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(QTYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-1">
        <Input type="number" min={0} step={0.5} value={q.points} onChange={(e) => update({ ...q, points: Number(e.target.value) })} className="h-8 w-20" data-testid={`question-points-${i}`} />
        <span className="mr-2 text-xs text-slate-500">pts</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(-1)} data-testid={`question-up-${i}`}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === total - 1} onClick={() => move(1)} data-testid={`question-down-${i}`}><ArrowDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={remove} data-testid={`question-delete-${i}`}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
    <Textarea value={q.text} onChange={(e) => update({ ...q, text: e.target.value })} placeholder="Énoncé de la question" className="mt-4" data-testid={`question-text-${i}`} />
    {q.type === "mcq" && (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-500">Cliquez sur le cercle pour marquer la ou les bonnes réponses (invisible pour l'élève).</p>
        {q.options.map((o, j) => {
          const ok = (q.correct || []).includes(j);
          return (
            <div key={j} className="flex items-center gap-2">
              <button type="button" aria-label={ok ? "Bonne réponse" : "Marquer comme bonne réponse"} title="Bonne réponse"
                onClick={() => update({ ...q, correct: ok ? q.correct.filter((k) => k !== j) : [...(q.correct || []), j].sort((a, b) => a - b) })}
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${ok ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 hover:border-emerald-500"}`}
                data-testid={`question-${i}-correct-${j}`}>{ok && <Check className="h-3 w-3" />}</button>
              <Input value={o} placeholder={`Choix ${j + 1}`} onChange={(e) => update({ ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} className={`h-9 ${ok ? "border-emerald-500 bg-emerald-50" : ""}`} data-testid={`question-${i}-option-${j}`} />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => update({ ...q, options: q.options.filter((_, k) => k !== j), correct: (q.correct || []).filter((k) => k !== j).map((k) => (k > j ? k - 1 : k)) })} data-testid={`question-${i}-option-remove-${j}`}><X className="h-4 w-4" /></Button>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" className="text-blue-800" onClick={() => update({ ...q, options: [...q.options, ""] })} data-testid={`question-${i}-add-option`}><Plus className="mr-1 h-4 w-4" />Ajouter un choix</Button>
        {!(q.correct || []).length && <p className="text-xs text-amber-700" data-testid={`question-${i}-no-correct`}>Aucune bonne réponse définie : la correction automatique sera désactivée pour cette question.</p>}
      </div>
    )}
    {q.type !== "mcq" && (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Consignes / précisions <span className="font-normal text-slate-400">(affichées à l'élève)</span></label>
          <Textarea value={q.hint || ""} onChange={(e) => update({ ...q, hint: e.target.value })} placeholder="Ex. : Répondez en 2 ou 3 phrases complètes." rows={2} data-testid={`question-hint-${i}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Réponse attendue / corrigé <span className="font-normal text-slate-400">(enseignant seulement)</span></label>
          <Textarea value={q.expected || ""} onChange={(e) => update({ ...q, expected: e.target.value })} placeholder="Éléments de réponse attendus pour la correction" rows={2} className="border-emerald-200 bg-emerald-50/40" data-testid={`question-expected-${i}`} />
        </div>
      </div>
    )}
  </div>
);

export const QuestionEditor = ({ questions, onChange }) => {
  const add = (type) => onChange([...questions, { id: uid(), type, text: "", options: type === "mcq" ? ["", ""] : [], points: type === "long" ? 5 : 1 }]);
  const move = (i, d) => { const a = [...questions]; [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
  return (
    <div className="space-y-4" data-testid="question-editor">
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} i={i} total={questions.length}
          update={(nq) => onChange(questions.map((x, k) => (k === i ? nq : x)))}
          remove={() => onChange(questions.filter((_, k) => k !== i))}
          move={(d) => move(i, d)} />
      ))}
      <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-slate-300 p-4">
        <span className="mr-2 self-center text-sm text-slate-500">Ajouter :</span>
        {Object.entries(QTYPES).map(([k, v]) => (
          <Button key={k} size="sm" variant="outline" onClick={() => add(k)} data-testid={`add-question-${k}`}><Plus className="mr-1 h-4 w-4" />{v}</Button>
        ))}
      </div>
    </div>
  );
};
