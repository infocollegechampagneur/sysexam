import { Lock, Maximize, Globe, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

const Shell = ({ children, testId }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/95 px-4 backdrop-blur-md" data-testid={testId}>
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center fade-up">{children}</div>
  </div>
);

export const LockedOverlay = ({ violations }) => (
  <Shell testId="locked-overlay">
    <Lock className="mx-auto h-10 w-10 text-rose-500" />
    <h2 className="mt-4 font-display text-2xl font-bold text-white">Examen bloqué</h2>
    <p className="mt-2 text-slate-400">Vous avez atteint {violations} signalement(s). Votre enseignant·e a été averti·e et doit débloquer votre examen. Vos réponses sont sauvegardées.</p>
    <p className="mt-6 text-xs text-slate-500">En attente de déblocage…</p>
  </Shell>
);

export const TeacherMessageOverlay = ({ text, onRead }) => (
  <Shell testId="teacher-message-overlay">
    <MessageSquareWarning className="mx-auto h-10 w-10 text-amber-400" />
    <h2 className="mt-4 font-display text-2xl font-bold text-white">Message de votre enseignant·e</h2>
    <p className="mt-4 whitespace-pre-wrap rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-left text-amber-100" data-testid="teacher-message-text">{text}</p>
    <Button onClick={onRead} className="mt-6 w-full bg-blue-600 hover:bg-blue-500" data-testid="teacher-message-read-btn">J'ai lu et je reprends l'examen</Button>
  </Shell>
);

export const FullscreenOverlay = ({ toolOpen, onResume, onCloseTool }) => (
  <Shell testId="fullscreen-overlay">
    {toolOpen ? <Globe className="mx-auto h-10 w-10 text-emerald-400" /> : <Maximize className="mx-auto h-10 w-10 text-amber-400" />}
    <h2 className="mt-4 font-display text-2xl font-bold text-white">{toolOpen ? "Outil autorisé ouvert" : "Plein écran requis"}</h2>
    <p className="mt-2 text-slate-400">{toolOpen ? "Fermez la fenêtre de l'outil lorsque vous avez terminé, puis revenez en plein écran." : "L'examen est masqué hors du plein écran. Cette sortie a été enregistrée."}</p>
    <div className="mt-6 flex flex-col gap-2">
      {toolOpen && <Button variant="outline" onClick={onCloseTool} className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800" data-testid="close-tool-btn">Fermer l'outil</Button>}
      <Button onClick={onResume} className="bg-blue-600 hover:bg-blue-500" data-testid="resume-fullscreen-btn">Revenir en plein écran</Button>
    </div>
  </Shell>
);

export const SubmittedScreen = ({ name }) => (
  <div className="grid min-h-screen place-items-center bg-slate-950 px-4" data-testid="submitted-screen">
    <div className="max-w-md text-center fade-up">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <h1 className="mt-5 font-display text-3xl font-bold text-white">Copie remise</h1>
      <p className="mt-3 text-slate-400">Merci {name}. Votre examen a bien été transmis à votre enseignant·e. Vous pouvez fermer cette page.</p>
    </div>
  </div>
);
