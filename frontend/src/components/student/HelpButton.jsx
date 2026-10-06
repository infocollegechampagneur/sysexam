import { useState } from "react";
import { HandHelping, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatErr } from "@/lib/api";

const REASONS = ["Problème technique", "Question sur une consigne", "Besoin de matériel", "Autre"];

export const HelpButton = ({ sapi, pending, onChange }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await sapi.post("/student/help", { reason });
      onChange(data);
      setOpen(false);
      setReason("");
      toast.success("Demande envoyée. Votre enseignant·e a été averti·e et viendra vous voir.", { duration: 8000 });
    } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await sapi.delete("/student/help"); onChange(null); toast.info("Demande d'aide annulée"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <Button size="sm" variant="outline" onClick={cancel} disabled={busy} className="h-8 border-amber-500 bg-amber-950/60 text-amber-200 hover:bg-amber-900 hover:text-white" title="Cliquer pour annuler la demande" data-testid="help-pending-btn">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1.5 h-3.5 w-3.5 animate-pulse" />Aide demandée</>}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="h-8 bg-amber-500 text-slate-950 hover:bg-amber-400" data-testid="help-request-btn">
        <HandHelping className="mr-1.5 h-3.5 w-3.5" />J'ai besoin d'aide
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="help-dialog">
          <DialogHeader>
            <DialogTitle>Demander de l'aide</DialogTitle>
            <DialogDescription>Votre enseignant·e recevra une alerte avec votre nom et viendra vous voir. Précisez le motif si vous le souhaitez.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${reason === r ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600 hover:border-blue-300"}`} data-testid={`help-reason-${REASONS.indexOf(r)}`}>{r}</button>
            ))}
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} placeholder="Motif (facultatif)" rows={2} data-answer-zone="" data-testid="help-reason-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="help-cancel-btn">Annuler</Button>
            <Button onClick={send} disabled={busy} className="bg-amber-500 text-slate-950 hover:bg-amber-400" data-testid="help-send-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer la demande"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
