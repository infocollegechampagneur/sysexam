import { useState } from "react";
import { Trash2, Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { api, formatErr } from "@/lib/api";

export const ClearSessionsButton = ({ exam, sessions, onDone }) => {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const active = sessions.filter((s) => s.status === "in_progress").length;
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.delete(`/exams/${exam.id}/sessions`); toast.success(`${data.deleted} copie(s) supprimée(s). L'examen est vide et prêt à être réutilisé.`); setOpen(false); setConfirm(""); onDone(); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" disabled={!sessions.length} data-testid="clear-sessions-btn"><Eraser className="mr-1.5 h-4 w-4" />Vider les copies</Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="clear-sessions-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer toutes les copies de cet examen ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              <p><strong>{sessions.length}</strong> copie(s), leurs réponses, notes et historiques de surveillance seront supprimés définitivement. L'examen (questions, document, réglages, code <span className="font-mono">{exam.code}</span>) est conservé et redevient vide pour une prochaine passation.</p>
              {active > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" data-testid="clear-sessions-active-warning">Attention : {active} élève(s) sont en cours d'examen et seront déconnectés.</p>}
              <p>Pensez à exporter les copies (PDF / Word) avant. Pour confirmer, tapez <strong>SUPPRIMER</strong> :</p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SUPPRIMER" data-testid="clear-sessions-confirm-input" />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="clear-sessions-cancel">Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={confirm.trim().toUpperCase() !== "SUPPRIMER" || busy} className="bg-rose-700 hover:bg-rose-800" data-testid="clear-sessions-confirm-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer toutes les copies"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const DeleteSessionButton = ({ session, onDone }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await api.delete(`/sessions/${session.id}`); toast.success(`Copie de ${session.student_name} supprimée`); onDone(); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" data-testid="delete-session-btn"><Trash2 className="mr-1.5 h-4 w-4" />Supprimer</Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-session-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer la copie de {session.student_name} ?</AlertDialogTitle>
          <AlertDialogDescription>Réponses, note et historique seront supprimés définitivement. {session.status === "in_progress" && "L'élève est en cours d'examen et sera déconnecté."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="delete-session-cancel">Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={busy} className="bg-rose-700 hover:bg-rose-800" data-testid="delete-session-confirm-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
