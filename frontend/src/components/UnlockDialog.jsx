import { useState } from "react";
import { toast } from "sonner";
import { Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api, formatErr } from "@/lib/api";

const Option = ({ on, onClick, title, desc, testId }) => (
  <button type="button" onClick={onClick} data-testid={testId}
    className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${on ? "border-blue-900 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
  </button>
);

export const UnlockDialog = ({ open, onOpenChange, session, maxViolations, onDone }) => {
  const [mode, setMode] = useState("grant");
  const [extra, setExtra] = useState(1);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const go = async () => {
    setSaving(true);
    try {
      await api.post(`/sessions/${session.id}/unlock`, { mode, extra, message });
      toast.success("Examen débloqué");
      setMessage("");
      onOpenChange(false);
      onDone();
    } catch (e) { toast.error(formatErr(e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="unlock-dialog">
        <DialogHeader>
          <DialogTitle>Débloquer l'examen de {session.student_name}</DialogTitle>
          <DialogDescription>{session.violations} signalement(s) enregistré(s) · seuil de l'examen : {maxViolations}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Option on={mode === "grant"} onClick={() => setMode("grant")} testId="unlock-mode-grant"
            title="Accorder des signalements de plus" desc="Le compteur est conservé. L'élève sera bloqué de nouveau après le nombre de signalements accordés." />
          {mode === "grant" && (
            <div className="flex gap-2 pl-3" data-testid="unlock-extra-choices">
              {[1, 2].map((n) => (
                <Button key={n} type="button" size="sm" variant={extra === n ? "default" : "outline"} onClick={() => setExtra(n)}
                  className={extra === n ? "bg-blue-900 hover:bg-blue-800" : ""} data-testid={`unlock-extra-${n}`}>+{n} signalement{n > 1 ? "s" : ""}</Button>
              ))}
            </div>
          )}
          <Option on={mode === "reset"} onClick={() => setMode("reset")} testId="unlock-mode-reset"
            title="Remettre le compteur à zéro" desc={`L'élève repart à 0 / ${maxViolations}. L'historique complet reste conservé.`} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-900">Message à l'élève (facultatif)</p>
          <Textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex. : Dernier avertissement. Reste sur la page de l'examen jusqu'à la fin." data-testid="unlock-message-input" />
          <p className="mt-1 text-xs text-slate-500">L'élève devra lire ce message et confirmer avant de reprendre.</p>
        </div>
        <DialogFooter>
          <Button onClick={go} disabled={saving} className="bg-rose-600 hover:bg-rose-700" data-testid="unlock-confirm-btn"><Unlock className="mr-1.5 h-4 w-4" />Débloquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
