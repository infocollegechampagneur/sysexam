import { useState } from "react";
import { Users, Loader2, Mail, MailX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatErr } from "@/lib/api";

export const ImportUsersDialog = ({ open, onOpenChange, onDone }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const lines = text.split("\n").filter((l) => l.trim()).length;

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/users/import", { text, role: "teacher" });
      setResult(data);
      toast.success(`${data.created.length} compte(s) créé(s)${data.errors.length ? `, ${data.errors.length} ligne(s) ignorée(s)` : ""}`);
      onDone();
    } catch (e) { toast.error(formatErr(e)); } finally { setBusy(false); }
  };
  const copyAll = () => {
    navigator.clipboard.writeText(result.created.map((c) => `${c.name}\t${c.email}\t${c.password}`).join("\n"));
    toast.success("Liste copiée (nom, courriel, mot de passe temporaire)");
  };
  const close = (o) => { onOpenChange(o); if (!o) { setResult(null); setText(""); } };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Importer plusieurs enseignants</DialogTitle></DialogHeader>
        {!result ? (
          <>
            <Label>Une personne par ligne : <span className="font-mono text-xs">Nom;courriel</span> (ou séparés par une virgule / tabulation, copié depuis Excel)</Label>
            <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Marie Tremblay;marie.tremblay@champagneur.qc.ca\nJacob Gagnon;jacob.gagnon@champagneur.qc.ca"} className="font-mono text-sm" data-testid="import-users-textarea" />
            <p className="text-xs text-slate-500">Un mot de passe temporaire est généré pour chaque personne et envoyé par courriel (si la messagerie est configurée). Les courriels déjà utilisés sont ignorés.</p>
            <DialogFooter><Button onClick={run} disabled={busy || !lines} className="bg-blue-900 hover:bg-blue-800" data-testid="import-users-submit">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Créer ${lines} compte(s)`}</Button></DialogFooter>
          </>
        ) : (
          <div data-testid="import-users-result">
            {!result.mail_configured && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">La messagerie n'est pas configurée : transmettez vous-même les mots de passe ci-dessous.</p>}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Nom</th><th className="p-2">Courriel</th><th className="p-2">Mot de passe temp.</th><th className="p-2">Courriel</th></tr></thead>
                <tbody>
                  {result.created.map((c, i) => (
                    <tr key={c.id} className="border-t border-slate-100" data-testid={`import-created-${i}`}>
                      <td className="p-2">{c.name}</td><td className="p-2 text-slate-600">{c.email}</td><td className="p-2 font-mono">{c.password}</td>
                      <td className="p-2">{c.email_sent ? <span className="flex items-center gap-1 text-emerald-700"><Mail className="h-3.5 w-3.5" />envoyé</span> : <span className="flex items-center gap-1 text-slate-500"><MailX className="h-3.5 w-3.5" />non envoyé</span>}</td>
                    </tr>
                  ))}
                  {result.errors.map((e, i) => (
                    <tr key={`e${i}`} className="border-t border-rose-100 bg-rose-50 text-rose-800" data-testid={`import-error-${i}`}><td className="p-2 font-mono text-xs" colSpan={3}>{e.line}</td><td className="p-2 text-xs">{e.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter className="mt-4 gap-2">
              {result.created.length > 0 && <Button variant="outline" onClick={copyAll} data-testid="import-copy-btn">Copier la liste</Button>}
              <Button onClick={() => close(false)} className="bg-blue-900 hover:bg-blue-800" data-testid="import-close-btn">Fermer</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
