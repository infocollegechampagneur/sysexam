import { useState } from "react";
import { toast } from "sonner";
import { Lock, RotateCcw, Megaphone, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { api, formatErr } from "@/lib/api";
import { fmtTime } from "@/lib/tools";
import { ExamPauseControl } from "@/components/PauseControls";

const call = async (fn, ok, done) => {
  try { const r = await fn(); toast.success(typeof ok === "function" ? ok(r.data) : ok); done?.(); } catch (e) { toast.error(formatErr(e)); }
};

export const LockSessionButton = ({ session, onDone }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" data-testid="lock-session-btn"><Lock className="mr-1.5 h-4 w-4" />Bloquer</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bloquer l'examen de {session.student_name}</DialogTitle><DialogDescription>L'élève ne peut plus écrire jusqu'à ce que vous le débloquiez. Ses réponses sont conservées.</DialogDescription></DialogHeader>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Raison (facultatif, visible dans l'historique)" data-testid="lock-reason-input" />
        <DialogFooter>
          <Button className="bg-rose-600 hover:bg-rose-700" data-testid="lock-session-confirm-btn"
            onClick={() => call(() => api.post(`/sessions/${session.id}/lock`, { reason }), "Examen bloqué", () => { setOpen(false); setReason(""); onDone(); })}>
            <Lock className="mr-1.5 h-4 w-4" />Bloquer maintenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ReopenSessionButton = ({ session, onDone }) => (
  <AlertDialog>
    <AlertDialogTrigger asChild><Button variant="outline" data-testid="reopen-session-btn"><RotateCcw className="mr-1.5 h-4 w-4" />Rouvrir la copie</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Rouvrir la copie de {session.student_name} ?</AlertDialogTitle>
        <AlertDialogDescription>L'élève pourra se reconnecter avec le même code, le même nom et le même matricule, puis continuer là où il était.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Annuler</AlertDialogCancel>
        <AlertDialogAction data-testid="reopen-session-confirm-btn" onClick={() => call(() => api.post(`/sessions/${session.id}/reopen`), "Copie rouverte", onDone)}>Rouvrir</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const ClassControls = ({ examId, exam, sessions, onDone }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const active = sessions.filter((s) => s.status === "in_progress").length;
  const locked = sessions.filter((s) => s.status === "locked").length;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="class-controls">
      <span className="mr-2 text-sm font-semibold text-slate-700">Toute la classe :</span>
      {exam && <ExamPauseControl exam={exam} onDone={onDone} />}
      {exam?.paused_at && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900" data-testid="exam-paused-badge">En pause depuis {fmtTime(exam.paused_at)}</span>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" data-testid="broadcast-open-btn"><Megaphone className="mr-1.5 h-4 w-4" />Message à tous</Button></DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Message à toute la classe</DialogTitle><DialogDescription>Envoyé aux {active + locked} élève(s) en cours ou bloqués. Chacun doit confirmer sa lecture.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-2">
            {["Il reste 10 minutes.", "Il reste 5 minutes. Pensez à relire et à remettre votre copie.", "Rappel : restez sur la page de l'examen."].map((p, i) => (
              <button key={p} type="button" onClick={() => setText(p)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50" data-testid={`broadcast-preset-${i}`}>{p}</button>
            ))}
          </div>
          <Textarea rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} data-testid="broadcast-input" />
          <DialogFooter>
            <Button disabled={!text.trim()} className="bg-blue-900 hover:bg-blue-800" data-testid="broadcast-confirm-btn"
              onClick={() => call(() => api.post(`/exams/${examId}/broadcast`, { text }), (d) => `Message envoyé à ${d.sent} élève(s)`, () => { setOpen(false); setText(""); onDone(); })}>Envoyer à tous</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="outline" disabled={!active} className="border-rose-300 text-rose-700 hover:bg-rose-50" data-testid="lock-all-btn"
        onClick={() => window.confirm(`Bloquer les ${active} examen(s) en cours ?`) && call(() => api.post(`/exams/${examId}/lock-all`), (d) => `${d.count} examen(s) bloqué(s)`, onDone)}>
        <Lock className="mr-1.5 h-4 w-4" />Bloquer tous ({active})
      </Button>
      <Button size="sm" variant="outline" disabled={!locked} data-testid="unlock-all-btn"
        onClick={() => window.confirm(`Débloquer les ${locked} examen(s) bloqué(s) ? Leur compteur sera remis à zéro.`) && call(() => api.post(`/exams/${examId}/unlock-all`), (d) => `${d.count} examen(s) débloqué(s)`, onDone)}>
        <Unlock className="mr-1.5 h-4 w-4" />Débloquer tous ({locked})
      </Button>
    </div>
  );
};
