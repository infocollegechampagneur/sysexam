import { useEffect, useState } from "react";
import { FolderSearch, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, formatErr } from "@/lib/api";

const TOOLS = [
  { id: "lexibar", label: "Lexibar", hint: "C:\\Program Files\\LexibarLP5X\\Lexibar.exe" },
  { id: "wordq", label: "WordQ", hint: "C:\\Program Files (x86)\\WordQ 5\\WordQ.exe" },
];

export const ToolPathsSettings = () => {
  const [paths, setPaths] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/tool-paths").then((r) => setPaths(r.data)).catch(() => setPaths({})); }, []);
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/admin/tool-paths", { paths }); setPaths(data); toast.success("Chemins enregistrés : ils seront utilisés au prochain démarrage d'un examen dans l'application Windows."); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  if (!paths) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="tool-paths-settings">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900"><FolderSearch className="h-5 w-5 text-blue-900" />Logiciels d'aide — chemins sur les postes (application Windows)</h3>
      <p className="mt-1 text-sm text-slate-600">Si l'application Windows ne trouve pas un logiciel, indiquez ici le chemin complet de son exécutable (un par ligne, <code className="rounded bg-slate-100 px-1">*</code> accepté, <code className="rounded bg-slate-100 px-1">%LOCALAPPDATA%</code> accepté). Pour le trouver : clic droit sur le raccourci → Propriétés → champ « Cible ». Ces chemins sont essayés en premier, avant la détection automatique (registre Windows, menu Démarrer).</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {TOOLS.map((t) => (
          <div key={t.id}>
            <label className="mb-1 block text-sm font-medium text-slate-800">{t.label}</label>
            <Textarea rows={3} value={(paths[t.id] || []).join("\n")} onChange={(e) => setPaths({ ...paths, [t.id]: e.target.value.split("\n") })} placeholder={t.hint} className="font-mono text-xs" data-testid={`tool-path-${t.id}`} />
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={busy} className="mt-4 bg-blue-900 hover:bg-blue-800" data-testid="tool-paths-save-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" />Enregistrer</>}</Button>
    </section>
  );
};
