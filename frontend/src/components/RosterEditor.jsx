import { useRef, useState } from "react";
import { Plus, Trash2, Upload, Save, Loader2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export const parseRoster = (text) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/[;\t]/.test(l) ? /[;\t]/ : ",").map((x) => x.trim().replace(/^"|"$/g, "")))
    .filter((c) => c[0] && !/^nom/i.test(c[0]))
    .map((c) => ({ id: uid(), name: c[0], student_number: c[1] || "", extra_time_percent: Number(String(c[2] || "0").replace("%", "").replace(",", ".")) || 0 }));

const ImportDialog = ({ onImport }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const file = useRef(null);
  const readFile = async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; };
  const go = () => { const rows = parseRoster(text); if (!rows.length) return toast.error("Aucun élève détecté"); onImport(rows); setText(""); setOpen(false); toast.success(`${rows.length} élève(s) importé(s)`); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="roster-import-open-btn"><Upload className="mr-1.5 h-4 w-4" />Importer</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Importer une liste d'élèves</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Une ligne par élève : <code className="rounded bg-slate-100 px-1">Nom complet ; Matricule ; Temps supplémentaire %</code>. Vous pouvez coller directement depuis Excel ou choisir un fichier CSV.</p>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Marie Tremblay;TREM12345678;33\nJacob Gagnon;GAGJ23456789;0"} className="font-mono text-sm" data-testid="roster-import-textarea" />
        <input ref={file} type="file" accept=".csv,.txt" className="hidden" onChange={readFile} data-testid="roster-import-file-input" />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => file.current?.click()} data-testid="roster-import-file-btn"><ClipboardPaste className="mr-1.5 h-4 w-4" />Fichier CSV</Button>
          <Button onClick={go} className="bg-blue-900 hover:bg-blue-800" data-testid="roster-import-confirm-btn">Ajouter à la liste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const RosterEditor = ({ cls, onSave, onDelete }) => {
  const [name, setName] = useState(cls.name);
  const [students, setStudents] = useState(cls.students);
  const [saving, setSaving] = useState(false);
  const upd = (i, k, v) => setStudents((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => { setSaving(true); await onSave({ name, students: students.filter((s) => s.name.trim()) }); setSaving(false); };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6" data-testid="roster-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm font-display text-lg font-semibold" data-testid="class-name-input" />
        <div className="ml-auto flex gap-2">
          <ImportDialog onImport={(rows) => setStudents((s) => [...s, ...rows])} />
          <Button onClick={save} disabled={saving} className="bg-blue-900 hover:bg-blue-800" data-testid="save-class-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" />Enregistrer</>}</Button>
          <Button variant="ghost" className="text-rose-600" onClick={onDelete} data-testid="delete-class-btn"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500"><th className="py-2 pr-2">Nom complet</th><th className="py-2 pr-2">Matricule</th><th className="py-2 pr-2">Temps supp. (%)</th><th /></tr></thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-100" data-testid={`roster-row-${i}`}>
                <td className="py-1.5 pr-2"><Input value={s.name} onChange={(e) => upd(i, "name", e.target.value)} className="h-9" data-testid={`roster-name-${i}`} /></td>
                <td className="py-1.5 pr-2"><Input value={s.student_number} onChange={(e) => upd(i, "student_number", e.target.value)} className="h-9 font-mono" data-testid={`roster-number-${i}`} /></td>
                <td className="py-1.5 pr-2"><Input type="number" min={0} max={200} value={s.extra_time_percent} onChange={(e) => upd(i, "extra_time_percent", Number(e.target.value))} className="h-9 w-24" data-testid={`roster-extra-${i}`} /></td>
                <td className="py-1.5 text-right"><Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setStudents((x) => x.filter((_, j) => j !== i))} data-testid={`roster-remove-${i}`}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!students.length && <p className="py-6 text-center text-sm text-slate-500">Aucun élève. Ajoutez-les un par un ou importez une liste.</p>}
      </div>
      <Button variant="ghost" className="mt-3 text-blue-800" onClick={() => setStudents((s) => [...s, { id: uid(), name: "", student_number: "", extra_time_percent: 0 }])} data-testid="roster-add-row-btn"><Plus className="mr-1 h-4 w-4" />Ajouter un élève</Button>
      <p className="mt-4 text-xs text-slate-500">Le temps supplémentaire s'applique automatiquement à la durée de chaque examen associé à cette classe (ex. 33 % = un tiers de temps en plus).</p>
    </div>
  );
};
