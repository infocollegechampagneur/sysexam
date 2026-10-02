import { useState } from "react";
import { toast } from "sonner";
import { PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { api, formatErr } from "@/lib/api";

const PRESETS = ["Déposez vos crayons et écoutez la consigne.", "Correction d'une erreur dans l'énoncé, un instant.", "Pause de 5 minutes, restez à votre place."];

// Pause / reprise générique : `pause(message)` et `resume()` retournent une promesse, `paused` = état actuel
export const PauseControl = ({ paused, pause, resume, label = "Mettre en pause", resumeLabel = "Reprendre", size = "sm", testId = "pause", disabled }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(typeof ok === "function" ? ok(r?.data) : ok); setOpen(false); setText(""); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); } };
  if (paused) {
    return (
      <Button size={size} onClick={() => run(resume, (d) => `Reprise : ${d?.count ?? ""} élève(s), temps de pause ajouté au chronomètre`)} disabled={busy || disabled} className="bg-emerald-600 hover:bg-emerald-500" data-testid={`${testId}-resume-btn`}>
        <PlayCircle className="mr-1.5 h-4 w-4" />{resumeLabel}
      </Button>
    );
  }
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)} disabled={disabled} className="border-amber-300 text-amber-800 hover:bg-amber-50" data-testid={`${testId}-btn`}>
        <PauseCircle className="mr-1.5 h-4 w-4" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5 text-amber-600" />{label}</DialogTitle>
            <DialogDescription>L'écran des élèves se voile, la saisie est bloquée et le chronomètre s'arrête. Le temps de pause est redonné à la reprise. Aucun signalement n'est compté pendant la pause.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => <button key={p} type="button" onClick={() => setText(p)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50" data-testid={`${testId}-preset-${i}`}>{p}</button>)}
          </div>
          <Textarea rows={2} maxLength={300} placeholder="Consigne affichée aux élèves (facultatif)" value={text} onChange={(e) => setText(e.target.value)} data-testid={`${testId}-message-input`} />
          <DialogFooter>
            <Button disabled={busy} className="bg-amber-600 hover:bg-amber-500" onClick={() => run(() => pause(text.trim()), (d) => `En pause : ${d?.count ?? ""} élève(s)`)} data-testid={`${testId}-confirm-btn`}>Mettre en pause maintenant</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const ExamPauseControl = ({ exam, onDone }) => (
  <PauseControl paused={!!exam.paused_at} testId="exam-pause"
    pause={(message) => api.post(`/exams/${exam.id}/pause`, { message }).then((r) => { onDone?.(); return r; })}
    resume={() => api.post(`/exams/${exam.id}/resume`).then((r) => { onDone?.(); return r; })}
    label="Pause (toute la classe)" resumeLabel="Reprendre (toute la classe)" />
);

export const SessionPauseControl = ({ session, onDone }) => (
  <PauseControl paused={!!session.paused_at} testId="session-pause" disabled={session.status !== "in_progress"}
    pause={(message) => api.post(`/sessions/${session.id}/pause`, { message }).then((r) => { onDone?.(); return r; })}
    resume={() => api.post(`/sessions/${session.id}/resume`).then((r) => { onDone?.(); return r; })}
    label="Pause (cet élève)" resumeLabel="Reprendre (cet élève)" />
);

export const AllExamsPauseControl = ({ exams, onDone }) => {
  const open = exams.filter((e) => e.status === "open");
  const pausedCount = exams.filter((e) => e.paused_at).length;
  if (!open.length && !pausedCount) return null;
  return (
    <PauseControl paused={pausedCount > 0 && pausedCount >= open.length} testId="all-pause" size="default"
      pause={(message) => api.post("/exams/pause-many", { message }).then((r) => { onDone?.(); return r; })}
      resume={() => api.post("/exams/resume-many", {}).then((r) => { onDone?.(); return r; })}
      label={`Pause de tous mes examens ouverts (${open.length})`} resumeLabel={`Reprendre tous mes examens (${pausedCount})`} />
  );
};
