import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2, ListChecks, PenLine, FileText, Check, HandHelping } from "lucide-react";
import { RecipientsPicker } from "@/components/RecipientsPicker";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeacherLayout } from "@/components/TeacherLayout";
import { QuestionEditor } from "@/components/QuestionEditor";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FilePanel } from "@/components/FilePanel";
import { api, formatErr } from "@/lib/api";
import { EXAM_TYPES, STATUS_LABELS } from "@/lib/tools";

const ICONS = { form: ListChecks, redaction: PenLine, document: FileText };
const EMPTY = {
  title: "", subject: "", instructions: "", exam_type: "form", duration_minutes: 60, questions: [], writing_prompt: "", status: "draft", class_id: null, doc_answer_mode: "separate", help_recipients: [],
  settings: { allowed_tools: [], max_violations: 3, lock_on_max: true, require_fullscreen: true, block_clipboard: true, browser_spellcheck: false, partial_credit: false, shuffle_options: false, help_button: true },
};
const FIELDS = Object.keys(EMPTY);

const TypePicker = ({ value, onChange }) => (
  <div className="grid gap-3 md:grid-cols-3">
    {EXAM_TYPES.map((t) => {
      const Icon = ICONS[t.id];
      const on = value === t.id;
      return (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} data-testid={`exam-type-${t.id}`}
          className={`relative rounded-xl border-2 p-5 text-left transition-colors ${on ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
          {on && <Check className="absolute right-4 top-4 h-4 w-4 text-blue-900" />}
          <Icon className="h-6 w-6 text-blue-900" />
          <p className="mt-3 font-display font-semibold text-slate-900">{t.label}</p>
          <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
        </button>
      );
    })}
  </div>
);

export default function ExamBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState({ id: null, code: null, file: null });
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState([]);

  useEffect(() => { api.get("/classes").then((r) => setClasses(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) return;
    api.get(`/exams/${id}`).then(({ data }) => {
      setForm(Object.fromEntries(FIELDS.map((k) => [k, data[k] ?? EMPTY[k]])));
      setMeta({ id: data.id, code: data.code, file: data.file });
    }).catch((e) => toast.error(formatErr(e)));
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (silent = false) => {
    if (!form.title.trim()) { toast.error("Le titre est obligatoire"); throw new Error("title"); }
    setSaving(true);
    try {
      const { data } = meta.id ? await api.put(`/exams/${meta.id}`, form) : await api.post("/exams", form);
      setMeta((m) => ({ ...m, id: data.id, code: data.code }));
      if (!meta.id) nav(`/enseignant/examens/${data.id}`, { replace: true });
      if (!silent) toast.success("Examen enregistré");
      return data.id;
    } catch (e) {
      toast.error(formatErr(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const showQuestions = form.exam_type !== "redaction";
  return (
    <TeacherLayout>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/enseignant")} data-testid="builder-back-btn"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{meta.id ? "Modifier l'examen" : "Nouvel examen"}</h1>
            {meta.code && <p className="text-sm text-slate-500">Code : <span className="font-mono font-bold tracking-widest text-blue-900" data-testid="builder-exam-code">{meta.code}</span></p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger className="w-36" data-testid="exam-status-select"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => save().catch(() => {})} disabled={saving} className="bg-blue-900 hover:bg-blue-800" data-testid="save-exam-btn">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Enregistrer</>}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="info" data-testid="builder-tab-info">1. Informations</TabsTrigger>
          <TabsTrigger value="content" data-testid="builder-tab-content">2. Type et contenu</TabsTrigger>
          <TabsTrigger value="security" data-testid="builder-tab-security">3. Outils et sécurité</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <div className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Titre *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-1.5" data-testid="exam-title-input" /></div>
            <div><Label>Matière / groupe</Label><Input value={form.subject} onChange={(e) => set("subject", e.target.value)} className="mt-1.5" data-testid="exam-subject-input" /></div>
            <div><Label>Durée (minutes, 0 = sans limite)</Label><Input type="number" min={0} value={form.duration_minutes} onChange={(e) => set("duration_minutes", Math.max(0, Number(e.target.value)))} className="mt-1.5" data-testid="exam-duration-input" /></div>
            <div className="md:col-span-2"><Label>Consignes pour les élèves</Label><Textarea rows={4} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} className="mt-1.5" data-testid="exam-instructions-input" /></div>
            <div className="md:col-span-2">
              <Label>Liste de classe</Label>
              <Select value={form.class_id || "none"} onValueChange={(v) => set("class_id", v === "none" ? null : v)}>
                <SelectTrigger className="mt-1.5" data-testid="exam-class-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune — ouvert à tout élève qui a le code</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.students.length} élèves)</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-slate-500">Avec une classe, seuls les élèves inscrits peuvent rejoindre, et leur temps supplémentaire est appliqué. Gérez vos listes dans l'onglet « Classes ».</p>
            </div>
            <div className="md:col-span-2" data-testid="help-recipients-section">
              <Label className="flex items-center gap-1.5"><HandHelping className="h-4 w-4 text-amber-600" />Collègues avertis quand un élève demande de l'aide</Label>
              <p className="mb-2 mt-1 text-xs text-slate-500">Vous recevez toujours les demandes « J'ai besoin d'aide ». Cochez les collègues (surveillants, techniciens) qui doivent aussi les recevoir — dans l'application et dans Teams s'ils l'ont configuré.</p>
              <RecipientsPicker value={form.help_recipients} onChange={(v) => set("help_recipients", v)} excludeId={user?.id} testId="help-recipient" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-6 space-y-8">
          <TypePicker value={form.exam_type} onChange={(v) => set("exam_type", v)} />
          {form.exam_type === "document" && (
            <div className="grid gap-3 md:grid-cols-2" data-testid="doc-answer-mode">
              {[["separate", "Zone de réponse séparée", "Le document est affiché à côté d'un éditeur où l'élève répond."],
                ["inline", "Écrire directement dans le document", "Word : l'élève modifie le document lui-même. PDF : l'élève ajoute des zones de texte sur les pages."]].map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => set("doc_answer_mode", k)} data-testid={`doc-mode-${k}`}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${form.doc_answer_mode === k ? "border-blue-900 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                  <p className="font-semibold text-slate-900">{t}</p><p className="mt-1 text-xs text-slate-500">{d}</p>
                </button>
              ))}
            </div>
          )}
          {form.exam_type !== "form" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <Label>{form.exam_type === "redaction" ? "Sujet de la rédaction" : "Consigne de la zone de réponse"}</Label>
              <Textarea rows={3} value={form.writing_prompt} onChange={(e) => set("writing_prompt", e.target.value)} className="mt-1.5" data-testid="exam-writing-prompt-input" />
            </div>
          )}
          <div>
            <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Document de l'examen {form.exam_type !== "document" && <span className="text-sm font-normal text-slate-500">(facultatif)</span>}</h3>
            <FilePanel examId={meta.id} file={meta.file} ensureSaved={() => save(true)} onFile={(f) => setMeta((m) => ({ ...m, file: f }))} />
          </div>
          {showQuestions && (
            <div>
              <h3 className="mb-3 font-display text-lg font-semibold text-slate-900">Questions {form.exam_type === "document" && <span className="text-sm font-normal text-slate-500">(facultatif)</span>}</h3>
              <QuestionEditor questions={form.questions} onChange={(q) => set("questions", q)} subject={form.subject} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SettingsPanel settings={form.settings} onChange={(s) => set("settings", s)} />
        </TabsContent>
      </Tabs>
    </TeacherLayout>
  );
}
