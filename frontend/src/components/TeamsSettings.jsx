import { useState } from "react";
import { MessageSquare, Send, Loader2, ChevronDown, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatErr } from "@/lib/api";
import { TeamsHelpSteps } from "@/components/TeamsLinkField";

export const TeamsSettings = ({ user, setUser }) => {
  const [link, setLink] = useState("");
  const [email, setEmail] = useState(user?.teams_email || "");
  const [busy, setBusy] = useState("");
  const [showEmail, setShowEmail] = useState(!!user?.teams_email);
  const save = async (patch) => {
    setBusy("save");
    try { const { data } = await api.put("/auth/me", { name: user.name, ...patch }); setUser(data); setLink(""); setEmail(data.teams_email || ""); toast.success("Préférences de notification enregistrées"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try { const { data } = await api.post("/auth/me/teams-test"); toast.success(`Message de test envoyé (${data.sent.length}) : vérifiez Teams / votre boîte courriel.`); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4" data-testid="teams-settings">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4 text-indigo-700" />Alertes d'aide dans Microsoft Teams</p>
      <p className="mt-1 text-xs text-slate-600">Quand un élève clique « J'ai besoin d'aide », une carte apparaît dans le canal ou le clavardage Teams de votre choix. Collez simplement le lien du flux de travail Teams ci-dessous.</p>
      <label className="mt-3 block text-xs font-medium text-slate-700">Lien Teams (canal ou clavardage de groupe)</label>
      <div className="mt-1 flex gap-2">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={user?.teams_configured ? "Lien enregistré — collez un nouveau lien pour le remplacer" : "https://….logic.azure.com/… ou https://….powerautomate.com/…"} autoComplete="off" className="bg-white" data-testid="teams-link-input" />
        <Button onClick={() => save({ teams_webhook: link.trim() })} disabled={!link.trim() || !!busy} className="bg-indigo-700 hover:bg-indigo-600" data-testid="teams-link-save-btn">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <p className={`text-xs font-medium ${user?.teams_configured ? "text-emerald-700" : "text-slate-500"}`} data-testid="teams-status">{user?.teams_configured ? "✓ Lien Teams configuré" : "Lien Teams non configuré"}</p>
        {user?.teams_configured && <button type="button" onClick={() => save({ teams_webhook: "" })} className="text-xs text-slate-500 underline" data-testid="teams-link-remove-btn">Retirer</button>}
      </div>
      <TeamsHelpSteps testId="teams-help" />
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
        <Checkbox checked={!!user?.notify_email} onCheckedChange={(c) => save({ notify_email: !!c })} disabled={!!busy} data-testid="notify-email-checkbox" />
        <Mail className="h-3.5 w-3.5 text-slate-500" />Recevoir aussi l'alerte à mon courriel ({user?.email})
      </label>
      <button type="button" onClick={() => setShowEmail((s) => !s)} className="mt-3 flex items-center gap-1 text-xs text-slate-500" data-testid="teams-email-toggle">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showEmail ? "rotate-180" : ""}`} />Autre méthode : adresse courriel d'un canal Teams (moins fiable)
      </button>
      {showEmail && (
        <div className="mt-2 flex gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nomducanal.xxxxx@amer.teams.ms" autoComplete="off" className="bg-white" data-testid="teams-email-input" />
          <Button variant="outline" onClick={() => save({ teams_email: email.trim() })} disabled={email.trim().toLowerCase() === (user?.teams_email || "") || !!busy} data-testid="teams-email-save-btn">Enregistrer</Button>
        </div>
      )}
      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={test} disabled={!!busy || (!user?.teams_email && !user?.notify_email && !user?.teams_configured)} data-testid="teams-test-btn">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" />Envoyer un test</>}</Button>
      </div>
    </div>
  );
};
