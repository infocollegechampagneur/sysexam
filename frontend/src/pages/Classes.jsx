import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TeacherLayout } from "@/components/TeacherLayout";
import { RosterEditor } from "@/components/RosterEditor";
import { api, formatErr } from "@/lib/api";

export default function Classes() {
  const [classes, setClasses] = useState([]);
  const [sel, setSel] = useState(null);
  const [newName, setNewName] = useState("");

  const load = () => api.get("/classes").then((r) => setClasses(r.data)).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data } = await api.post("/classes", { name: newName.trim(), students: [] });
    setNewName("");
    await load();
    setSel(data.id);
  };
  const save = async (body) => {
    try { await api.put(`/classes/${sel}`, body); toast.success("Classe enregistrée"); load(); } catch (e) { toast.error(formatErr(e)); }
  };
  const del = async () => {
    await api.delete(`/classes/${sel}`);
    setSel(null);
    load();
  };
  const current = classes.find((c) => c.id === sel);

  return (
    <TeacherLayout>
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Listes de classe</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Mes classes</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">Associez une classe à un examen : seuls les élèves inscrits pourront le rejoindre, et leur temps supplémentaire sera appliqué automatiquement.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <aside className="space-y-2 lg:col-span-4">
          <form onSubmit={create} className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouvelle classe (ex. Groupe 402)" data-testid="new-class-name-input" />
            <Button type="submit" className="bg-blue-900 hover:bg-blue-800" data-testid="create-class-btn"><Plus className="h-4 w-4" /></Button>
          </form>
          {classes.map((c, i) => (
            <button key={c.id} onClick={() => setSel(c.id)} data-testid={`class-item-${i}`}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${sel === c.id ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500"><Users className="h-3.5 w-3.5" />{c.students.length}</span>
            </button>
          ))}
          {!classes.length && <p className="p-4 text-sm text-slate-500">Aucune classe pour l'instant.</p>}
        </aside>
        <section className="lg:col-span-8">
          {current ? <RosterEditor key={current.id} cls={current} onSave={save} onDelete={del} /> : (
            <div className="grid h-64 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">Sélectionnez ou créez une classe.</div>
          )}
        </section>
      </div>
    </TeacherLayout>
  );
}
