import { useEffect, useState } from "react";
import { Search, Plus, Trash2, Library } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatErr } from "@/lib/api";

const TYPE_LABELS = { mcq: "Choix multiple", short: "Réponse courte", long: "Développement" };

const BankItem = ({ it, i, onAdd, onRemove }) => (
  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3" data-testid={`bank-item-${i}`}>
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-sm font-medium text-slate-900">{it.question.text}</p>
      <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
        <span className="rounded bg-slate-100 px-1.5">{TYPE_LABELS[it.question.type]}</span>
        <span>{it.question.points} pt(s)</span>
        {it.subject && <span>· {it.subject}</span>}
        {it.exam_title && <span>· {it.exam_title}</span>}
        {it.source === "manual" && <span className="text-blue-700">· enregistrée manuellement</span>}
      </p>
      {it.question.type === "mcq" && <p className="mt-1 truncate text-xs text-slate-500">{it.question.options.map((o, k) => (it.question.correct?.includes(k) ? `✓ ${o}` : o)).join(" · ")}</p>}
    </div>
    <Button size="sm" onClick={() => onAdd(it)} className="bg-blue-900 hover:bg-blue-800" data-testid={`bank-add-${i}`}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => onRemove(it)} title="Retirer de la banque" data-testid={`bank-remove-${i}`}><Trash2 className="h-4 w-4" /></Button>
  </div>
);

export const BankDialog = ({ open, onOpenChange, onPick, excludeIds = [] }) => {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [subject, setSubject] = useState("all");
  const [data, setData] = useState({ items: [], subjects: [] });
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/bank", { params: { q, type: type === "all" ? "" : type, subject: subject === "all" ? "" : subject } })
      .then((r) => setData(r.data)).catch((e) => toast.error(formatErr(e))).finally(() => setLoading(false));
  };
  useEffect(() => { if (open) load(); }, [open, q, type, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (it) => {
    try { await api.delete(`/bank/${it.id}`); toast.success("Question retirée de la banque"); load(); } catch (e) { toast.error(formatErr(e)); }
  };
  const items = data.items.filter((it) => !excludeIds.includes(it.question_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0" data-testid="bank-dialog">
        <DialogHeader className="border-b border-slate-200 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 font-display"><Library className="h-5 w-5 text-blue-900" />Banque de questions</DialogTitle>
          <p className="text-xs text-slate-500">Toutes les questions de vos examens y sont ajoutées automatiquement. Cliquez sur « Ajouter » pour insérer une copie dans cet examen.</p>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans l'énoncé…" className="pl-8" data-testid="bank-search-input" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44" data-testid="bank-type-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les types</SelectItem>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-44" data-testid="bank-subject-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes les matières</SelectItem>{data.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto px-6 pb-6 pt-3" data-testid="bank-list">
          {loading && !items.length && <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>}
          {!loading && !items.length && <p className="py-8 text-center text-sm text-slate-500" data-testid="bank-empty">Aucune question trouvée.</p>}
          {items.map((it, i) => <BankItem key={it.id} it={it} i={i} onAdd={(x) => { onPick(x.question); toast.success("Question ajoutée"); }} onRemove={remove} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
};
