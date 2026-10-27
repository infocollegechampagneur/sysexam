import { Plus, X, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : "");
export const fmtWindow = (w) => {
  const a = new Date(w.start), b = new Date(w.end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const d = (x) => x.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
  const t = (x) => x.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit" });
  return a.toDateString() === b.toDateString() ? `${d(a)} · ${t(a)} → ${t(b)}` : `${d(a)} ${t(a)} → ${d(b)} ${t(b)}`;
};

export const WindowsEditor = ({ value = [], onChange }) => {
  const update = (i, k, v) => onChange(value.map((w, j) => (j === i ? { ...w, [k]: fromLocalInput(v) } : w)));
  const add = () => {
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(8, 0, 0, 0);
    const end = new Date(start); end.setHours(10, 0, 0, 0);
    onChange([...value, { start: start.toISOString(), end: end.toISOString() }]);
  };
  return (
    <div data-testid="windows-editor">
      <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-blue-900" />Plages de disponibilité (date et heure)</Label>
      <p className="mb-2 mt-1 text-xs text-slate-500">Sans plage, l'examen est accessible dès qu'il est « Ouvert ». Avec des plages, il doit être « Ouvert » <strong>et</strong> l'heure actuelle doit être dans une plage. Les élèves déjà en cours à la fin d'une plage peuvent terminer leur temps.</p>
      <div className="space-y-2">
        {value.map((w, i) => {
          const bad = w.start && w.end && new Date(w.end) <= new Date(w.start);
          return (
            <div key={i} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${bad ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`} data-testid={`window-row-${i}`}>
              <span className="w-12 text-xs font-medium text-slate-600">Début</span>
              <Input type="datetime-local" value={toLocalInput(w.start)} onChange={(e) => update(i, "start", e.target.value)} className="h-9 w-auto" data-testid={`window-start-${i}`} />
              <span className="w-8 text-xs font-medium text-slate-600">Fin</span>
              <Input type="datetime-local" value={toLocalInput(w.end)} onChange={(e) => update(i, "end", e.target.value)} className="h-9 w-auto" data-testid={`window-end-${i}`} />
              {bad && <span className="text-xs text-rose-700" data-testid={`window-error-${i}`}>La fin doit être après le début</span>}
              <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-rose-600" onClick={() => onChange(value.filter((_, j) => j !== i))} data-testid={`window-remove-${i}`}><X className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      <Button size="sm" variant="outline" onClick={add} className="mt-2" data-testid="window-add-btn"><Plus className="mr-1 h-4 w-4" />Ajouter une plage</Button>
    </div>
  );
};
