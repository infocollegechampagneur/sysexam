import { useState } from "react";
import { Lock, Maximize, Globe, CheckCircle2, MessageSquareWarning, PauseCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const Shell = ({ children, testId }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/95 px-4 backdrop-blur-md" data-testid={testId}>
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center fade-up">{children}</div>
  </div>
);

export const PausedOverlay = ({ message }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/95 px-4" data-testid="paused-overlay">
    <div className="max-w-lg text-center fade-up">
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-amber-500/20 text-amber-300"><PauseCircle className="h-9 w-9" /></div>
      <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">Examen en pause</h2>
      <p className="mt-3 text-base text-slate-300">Votre enseignant a mis l'examen en pause. Le chronomètre est arrêté : le temps de pause vous sera redonné. Écoutez les consignes.</p>
      {message && <p className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" data-testid="paused-message">{message}</p>}
      <p className="mt-6 text-xs text-slate-500">L'examen reprendra automatiquement.</p>
    </div>
  </div>
);

export const LockedOverlay = ({ violations, byTeacher, onEmergency }) => (
  <Shell testId="locked-overlay">
    <Lock className="mx-auto h-10 w-10 text-rose-500" />
    <h2 className="mt-4 font-display text-2xl font-bold text-white">Examen bloqué</h2>
    <p className="mt-2 text-slate-400" data-testid="locked-overlay-reason">
      {byTeacher ? "Votre enseignant·e a bloqué votre examen." : `Vous avez atteint ${violations} signalement(s). Votre enseignant·e a été averti·e.`} Vos réponses sont sauvegardées.
    </p>
    <p className="mt-6 text-xs text-slate-500">En attente de déblocage…</p>
    {onEmergency && <button type="button" onClick={onEmergency} className="mt-4 text-xs text-slate-600 underline hover:text-slate-400" data-testid="emergency-exit-link">Sortie d'urgence (enseignant)</button>}
  </Shell>
);

export const EmergencyExitDialog = ({ open, onOpenChange, onSubmit }) => {
  const [code, setCode] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); setCode(""); }}>
      <DialogContent className="z-[60] max-w-sm" data-testid="emergency-exit-dialog">
        <DialogHeader><DialogTitle>Sortie d'urgence — enseignant</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">Entrez le code de sortie de l'examen pour désactiver le mode kiosque. Cette action est enregistrée dans l'historique.</p>
        <Input type="password" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code à 6 chiffres" data-testid="emergency-exit-code-input" />
        <DialogFooter><Button onClick={() => onSubmit(code)} disabled={!code.trim()} className="bg-rose-600 hover:bg-rose-700" data-testid="emergency-exit-confirm-btn">Quitter le mode kiosque</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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

export const SubmittedScreen = ({ name, receipt }) => {
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    sessionStorage.removeItem("exam_token");
    if (window.monExam?.quitApp) return window.monExam.quitApp();
    window.close();
    setTimeout(() => { if (!window.closed) window.location.replace("/"); }, 400);
  };
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4" data-testid="submitted-screen">
      <div className="w-full max-w-md text-center fade-up">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-5 font-display text-3xl font-bold text-white">Copie remise avec succès</h1>
        <p className="mt-3 text-slate-400">Merci {name}. Votre examen est <strong className="text-emerald-300">enregistré sur le serveur</strong> et transmis à votre enseignant·e.</p>
        {receipt && (
          <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-left text-sm text-emerald-100" data-testid="submit-receipt">
            <p className="flex items-center justify-between"><span className="text-emerald-300/80">Numéro de confirmation</span><strong className="font-mono text-base tracking-widest" data-testid="receipt-code">{receipt.receipt}</strong></p>
            <p className="mt-1 flex items-center justify-between"><span className="text-emerald-300/80">Remise le</span><span data-testid="receipt-time">{receipt.submitted_at ? new Date(receipt.submitted_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—"}</span></p>
            {receipt.questions > 0 && <p className="mt-1 flex items-center justify-between"><span className="text-emerald-300/80">Questions répondues</span><span data-testid="receipt-answered">{receipt.answered} / {receipt.questions}</span></p>}
            {receipt.essay_words > 0 && <p className="mt-1 flex items-center justify-between"><span className="text-emerald-300/80">Production écrite</span><span data-testid="receipt-words">{receipt.essay_words} mots</span></p>}
            {receipt.annotations > 0 && <p className="mt-1 flex items-center justify-between"><span className="text-emerald-300/80">Annotations</span><span>{receipt.annotations}</span></p>}
          </div>
        )}
        <p className="mt-5 text-sm text-slate-400">Vous pouvez maintenant fermer {window.monExam ? "l'application" : "cette page"} en toute sécurité. Notez le numéro de confirmation si votre enseignant·e le demande.</p>
        <Button onClick={close} disabled={closing} className="mt-5 h-11 w-full bg-emerald-600 hover:bg-emerald-500" data-testid="close-after-submit-btn"><LogOut className="mr-2 h-4 w-4" />{window.monExam ? "Fermer l'application" : "Terminer et quitter"}</Button>
      </div>
    </div>
  );
};
