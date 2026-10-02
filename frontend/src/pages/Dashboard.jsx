import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Copy, Pencil, BarChart3, Trash2, FileText, ListChecks, PenLine, Users, AlertTriangle, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TeacherLayout } from "@/components/TeacherLayout";
import { api, formatErr } from "@/lib/api";
import { TOOLS, STATUS_LABELS } from "@/lib/tools";
import { AllExamsPauseControl } from "@/components/PauseControls";

const TYPE_ICON = { form: ListChecks, redaction: PenLine, document: FileText };
const TYPE_LABEL = { form: "Formulaire", redaction: "Rédaction", document: "Document" };
const STATUS_CLS = { open: "bg-emerald-50 text-emerald-700 border-emerald-200", draft: "bg-slate-100 text-slate-600 border-slate-200", closed: "bg-rose-50 text-rose-700 border-rose-200" };

const Stat = ({ icon: Icon, label, value, testId }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4" />{label}</div>
    <p className="mt-2 font-display text-3xl font-bold text-slate-900" data-testid={testId}>{value}</p>
  </div>
);

const ExamCard = ({ exam, onDelete }) => {
  const Icon = TYPE_ICON[exam.exam_type] || ListChecks;
  const nav = useNavigate();
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md" data-testid={`exam-card-${exam.code}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-800"><Icon className="h-3.5 w-3.5" />{TYPE_LABEL[exam.exam_type]}</span>
        <Badge variant="outline" className={STATUS_CLS[exam.status]} data-testid={`exam-status-${exam.code}`}>{STATUS_LABELS[exam.status]}</Badge>
        {exam.paused_at && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900" data-testid={`exam-paused-${exam.code}`}>En pause</Badge>}
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-slate-900">{exam.title}</h3>
      <p className="text-sm text-slate-500">{exam.subject || "—"}</p>
      <button
        className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-3 py-2 transition-colors hover:bg-blue-50"
        onClick={() => { navigator.clipboard?.writeText(exam.code); toast.success(`Code ${exam.code} copié`); }}
        data-testid={`copy-code-${exam.code}`}
      >
        <span className="font-mono text-lg font-bold tracking-[0.25em] text-blue-900">{exam.code}</span>
        <Copy className="h-4 w-4 text-blue-700" />
      </button>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TOOLS.filter((t) => exam.settings?.allowed_tools?.includes(t.id)).map((t) => (
          <span key={t.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t.label}</span>
        ))}
        {!exam.settings?.allowed_tools?.length && <span className="text-xs text-slate-400">Aucun outil permis</span>}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>{exam.session_count} copie(s)</span>
        {exam.flagged_count > 0 && <span className="text-amber-700">{exam.flagged_count} avec infraction(s)</span>}
        {exam.locked_count > 0 && <span className="font-semibold text-rose-700" data-testid={`exam-locked-count-${exam.code}`}>{exam.locked_count} bloquée(s)</span>}
        <span>{exam.duration_minutes ? `${exam.duration_minutes} min` : "Sans limite"}</span>
      </div>
      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => nav(`/enseignant/examens/${exam.id}`)} data-testid={`edit-exam-${exam.code}`}><Pencil className="mr-1.5 h-3.5 w-3.5" />Modifier</Button>
        <Button size="sm" className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={() => nav(`/enseignant/examens/${exam.id}/resultats`)} data-testid={`results-exam-${exam.code}`}><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Suivi</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" data-testid={`delete-exam-${exam.code}`}><Trash2 className="h-4 w-4" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cet examen ?</AlertDialogTitle>
              <AlertDialogDescription>L'examen et toutes les copies des élèves seront supprimés définitivement.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => onDelete(exam.id)} data-testid="confirm-delete-exam-btn">Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [exams, setExams] = useState(null);
  const load = () => api.get("/exams").then((r) => setExams(r.data)).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    await api.delete(`/exams/${id}`).catch((e) => toast.error(formatErr(e)));
    toast.success("Examen supprimé");
    load();
  };

  const list = exams || [];
  return (
    <TeacherLayout>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Tableau de bord</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Mes examens</h1>
        </div>
        <Link to="/enseignant/examens/nouveau">
          <Button className="h-11 bg-blue-900 px-5 hover:bg-blue-800" data-testid="create-exam-btn"><Plus className="mr-2 h-4 w-4" />Créer un examen</Button>
        </Link>
      </div>
      {exams && <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="dashboard-pause-bar"><AllExamsPauseControl exams={exams} onDone={load} />{exams.some((e) => e.paused_at) && <span className="text-sm text-amber-800">{exams.filter((e) => e.paused_at).length} examen(s) en pause</span>}</div>}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={ClipboardList} label="Examens ouverts" value={list.filter((e) => e.status === "open").length} testId="stat-open-exams" />
        <Stat icon={Users} label="Copies reçues" value={list.reduce((a, e) => a + e.session_count, 0)} testId="stat-sessions" />
        <Stat icon={AlertTriangle} label="Copies signalées" value={list.reduce((a, e) => a + e.flagged_count, 0)} testId="stat-flagged" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="exam-list">
        {list.map((e) => <ExamCard key={e.id} exam={e} onDelete={del} />)}
        {exams && !list.length && <p className="text-slate-500" data-testid="exam-list-empty">Aucun examen pour l'instant. Créez votre premier examen.</p>}
      </div>
    </TeacherLayout>
  );
}
