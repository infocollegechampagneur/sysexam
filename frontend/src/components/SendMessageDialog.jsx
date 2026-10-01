import { useState } from "react";
import { toast } from "sonner";
import { Send, MessageSquareWarning, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api, formatErr } from "@/lib/api";

const PRESETS = [
  "Reste sur la page de l'examen, s'il te plaît.",
  "Je vois des tentatives de copier-coller. C'est ton dernier avertissement.",
  "Concentre-toi sur ton travail. Il te reste du temps.",
];

export const MessageStatus = ({ msg }) => msg ? (
  <span className={`inline-flex items-center gap-1 text-xs ${msg.read ? "text-emerald-700" : "text-amber-700"}`} data-testid="teacher-message-status">
    {msg.read ? <CheckCheck className="h-3.5 w-3.5" /> : <MessageSquareWarning className="h-3.5 w-3.5" />}
    Dernier message {msg.read ? "lu" : "non lu"} ({new Date(msg.at).toLocaleTimeString("fr-CA")})
  </span>
) : null;

export const SendMessageDialog = ({ session, onDone }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      await api.post(`/sessions/${session.id}/message`, { text });
      toast.success("Avertissement envoyé");
      setText("");
      setOpen(false);
      onDone();
    } catch (e) { toast.error(formatErr(e)); } finally { setSending(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" data-testid="send-message-open-btn"><MessageSquareWarning className="mr-1.5 h-4 w-4" />Avertir</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="send-message-dialog">
        <DialogHeader>
          <DialogTitle>Avertir {session.student_name}</DialogTitle>
          <DialogDescription>Le message s'affiche sur l'écran de l'élève en quelques secondes. Il doit confirmer sa lecture pour continuer.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button key={p} type="button" onClick={() => setText(p)} className="rounded-full border border-slate-200 px-3 py-1 text-left text-xs text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50" data-testid={`message-preset-${i}`}>{p}</button>
          ))}
        </div>
        <Textarea rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre message à l'élève…" data-testid="send-message-input" />
        <DialogFooter>
          <Button onClick={send} disabled={sending || !text.trim()} className="bg-blue-900 hover:bg-blue-800" data-testid="send-message-confirm-btn"><Send className="mr-1.5 h-4 w-4" />Envoyer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
