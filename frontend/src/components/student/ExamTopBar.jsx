import { Globe, Monitor, CloudCheck, ShieldAlert, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ExamTimer } from "@/components/student/ExamTimer";
import { HelpButton } from "@/components/student/HelpButton";
import { TOOLS } from "@/lib/tools";

export const ExamTopBar = ({ exam, session, deadline, offsetMs, savedAt, violations, limit, desktopTools, onTool, onSubmit, submitting, onExpire, paused, unanswered = 0, essayWords = null, sapi, helpPending, onHelpChange }) => {
  const allowed = TOOLS.filter((t) => exam.settings.allowed_tools.includes(t.id));
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold text-white" data-testid="exam-topbar-title">{exam.title}</p>
          <p className="truncate text-xs text-slate-400">{session.student_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="exam-tools-bar">
          {allowed.map((t) => t.kind === "web" ? (
            <Button key={t.id} size="sm" variant="outline" onClick={() => onTool(t)} className="h-8 border-emerald-700 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900 hover:text-white" data-testid={`tool-button-${t.id}`}>
              <Globe className="mr-1 h-3.5 w-3.5" />{t.label}
            </Button>
          ) : desktopTools?.desktop ? (
            <Button key={t.id} size="sm" variant="outline" onClick={() => t.id === "antidote" ? toast.info("Antidote : cliquez sur le bouton vert « Corriger avec Antidote » dans la barre de votre zone de réponse. Le correcteur s'ouvre avec votre texte et applique les corrections directement.", { duration: 10000 }) : desktopTools.launch(t.id)} className="h-8 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white" title={desktopTools.running.includes(t.id) ? (t.id === "antidote" ? "Agent Antidote actif — Ctrl+C+C sur le texte" : "Ouvert — cliquer pour le mettre à l'avant-plan") : (t.id === "antidote" ? "Comment corriger avec Antidote" : "Cliquer pour ouvrir")} data-testid={`tool-launch-${t.id}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ${desktopTools.running.includes(t.id) ? "bg-emerald-400" : "bg-slate-500"}`} />
              <Monitor className="mr-1 h-3.5 w-3.5" />{t.label}
            </Button>
          ) : (
            <span key={t.id} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs text-slate-300" title="Logiciel permis sur ce poste" data-testid={`tool-badge-${t.id}`}>
              <Monitor className="h-3.5 w-3.5" />{t.label}
            </span>
          ))}
        </div>
        <span className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${violations ? "bg-rose-950 text-rose-300" : "bg-slate-800 text-slate-300"}`} data-testid="violations-indicator">
          <ShieldAlert className="h-3.5 w-3.5" />{violations}/{limit ?? exam.settings.max_violations}
        </span>
        <span className="hidden items-center gap-1 text-xs text-emerald-400 sm:flex" data-testid="autosave-indicator">
          <CloudCheck className="h-4 w-4" />{savedAt ? `Sauvegardé à ${new Date(savedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Non sauvegardé"}
        </span>
        <ExamTimer deadline={deadline} offsetMs={offsetMs} onExpire={onExpire} paused={paused} />
        {sapi && exam.settings?.help_button !== false && <HelpButton sapi={sapi} pending={helpPending} onChange={onHelpChange} />}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-500" disabled={submitting} data-testid="submit-exam-btn">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1.5 h-3.5 w-3.5" />Remettre</>}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remettre votre copie ?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>Une fois remise, vous ne pourrez plus modifier vos réponses. Vous recevrez ensuite une <strong>confirmation avec un numéro</strong> : attendez-la avant de fermer.</p>
                  {unanswered > 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900" data-testid="submit-unanswered-warning">Attention : <strong>{unanswered} question(s) sans réponse</strong>.</p>}
                  {essayWords !== null && <p className="text-slate-600" data-testid="submit-essay-words">Production écrite : <strong>{essayWords} mots</strong>{essayWords === 0 ? " — votre rédaction est vide !" : ""}</p>}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="cancel-submit-modal-btn">Continuer l'examen</AlertDialogCancel>
              <AlertDialogAction onClick={onSubmit} className="bg-blue-900 hover:bg-blue-800" data-testid="confirm-submit-modal-btn">Remettre</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
};
