import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RecipientsPicker, useTeachers } from "@/components/RecipientsPicker";
import { SoundSettings } from "@/components/SoundSettings";
import { ToolPathsSettings } from "@/components/ToolPathsSettings";
import { api, formatErr } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/tools";

const ExamRow = ({ e, i, teachers, onSaved }) => {
  const [val, setVal] = useState(e.help_recipients);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(val) !== JSON.stringify(e.help_recipients);
  const save = async () => {
    setBusy(true);
    try { await api.put(`/admin/exams/${e.id}/help-recipients`, { recipients: val }); toast.success("Destinataires mis à jour"); onSaved(); } catch (err) { toast.error(formatErr(err)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`help-exam-${i}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-slate-900">{e.title}</p>
        <span className="font-mono text-xs text-slate-500">{e.code}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{STATUS_LABELS[e.status] || e.status}</span>
        <span className="text-xs text-slate-500">· {e.teacher_name} (toujours averti)</span>
        {dirty && <Button size="sm" onClick={save} disabled={busy} className="ml-auto h-8 bg-blue-900 hover:bg-blue-800" data-testid={`help-exam-save-${i}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1 h-3.5 w-3.5" />Enregistrer</>}</Button>}
      </div>
      <div className="mt-3"><RecipientsPicker value={val} onChange={setVal} excludeId={e.teacher_id} teachers={teachers} testId={`help-exam-${i}-rcpt`} /></div>
    </div>
  );
};

export const HelpSettings = () => {
  const teachers = useTeachers();
  const [data, setData] = useState(null);
  const [defaults, setDefaults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState({ configured: false, name: "" });
  const load = () => api.get("/admin/help-settings").then((r) => { setData(r.data); setDefaults(r.data.default_recipients); }).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); api.get("/admin/alert-sound").then((r) => setSound(r.data)).catch(() => {}); }, []);
  const saveDefaults = async () => {
    setBusy(true);
    try { await api.put("/admin/help-settings/default", { recipients: defaults }); toast.success("Surveillants par défaut enregistrés"); load(); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  if (!data) return <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-6" data-testid="help-settings">
      <SoundSettings scope="admin" status={sound} onChange={setSound} />
      <ToolPathsSettings />
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <h3 className="font-display text-lg font-semibold text-slate-900">Surveillants par défaut</h3>
        <p className="mt-1 text-sm text-slate-600">Ces personnes reçoivent la demande « J'ai besoin d'aide » de <strong>tous</strong> les examens, en plus de l'enseignant·e responsable et des collègues choisis par examen. Celles avec l'icône Teams reçoivent aussi une carte dans Teams.</p>
        <div className="mt-4"><RecipientsPicker value={defaults} onChange={setDefaults} teachers={teachers} testId="help-default" /></div>
        <Button onClick={saveDefaults} disabled={busy} className="mt-4 bg-blue-900 hover:bg-blue-800" data-testid="help-default-save-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" />Enregistrer</>}</Button>
      </section>
      <section>
        <h3 className="font-display text-lg font-semibold text-slate-900">Destinataires par examen</h3>
        <p className="mt-1 text-sm text-slate-600">Modifiez pour n'importe quel examen les collègues avertis en plus de l'enseignant·e responsable.</p>
        <div className="mt-4 space-y-3">
          {!data.exams.length && <p className="text-sm text-slate-500">Aucun examen.</p>}
          {data.exams.map((e, i) => <ExamRow key={e.id} e={e} i={i} teachers={teachers} onSaved={load} />)}
        </div>
      </section>
    </div>
  );
};
