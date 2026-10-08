import { useState } from "react";
import { MessageSquare, Send, Loader2, ChevronDown, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatErr } from "@/lib/api";

const STEPS = [
  "Dans Teams, ouvrez le canal où vous voulez recevoir les alertes (ex. : « Surveillance examens »).",
  "Cliquez sur « ⋯ » à côté du nom du canal → « Obtenir l'adresse de courrier électronique » (Get email address).",
  "Cliquez sur « Copier » : l'adresse ressemble à nomducanal.xxxxx@amer.teams.ms (ou @emea.teams.ms).",
  "Collez-la ci-dessous, « Enregistrer », puis « Tester » : un message apparaît dans le canal en quelques secondes.",
  "Si l'option est absente, l'administrateur Microsoft 365 doit l'activer : centre d'administration Teams → Paramètres à l'échelle de l'organisation → Teams → « Les utilisateurs peuvent envoyer des courriels à une adresse de canal ».",
];

export const TeamsSettings = ({ user, setUser }) => {
  const [email, setEmail] = useState(user?.teams_email || "");
  const [busy, setBusy] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const save = async (patch) => {
    setBusy("save");
    try { const { data } = await api.put("/auth/me", { name: user.name, ...patch }); setUser(data); setEmail(data.teams_email || ""); toast.success("Préférences de notification enregistrées"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try { const { data } = await api.post("/auth/me/teams-test"); toast.success(`Message de test envoyé (${data.sent.length}) : vérifiez Teams / votre boîte courriel.`); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  const dirty = (email.trim().toLowerCase()) !== (user?.teams_email || "");
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4" data-testid="teams-settings">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4 text-indigo-700" />Alertes d'aide dans Microsoft Teams et par courriel</p>
      <p className="mt-1 text-xs text-slate-600">Quand un élève clique « J'ai besoin d'aide », l'alerte est envoyée par courriel à l'adresse de votre canal Teams (elle s'affiche comme un message dans le canal) et, si vous le souhaitez, à votre courriel personnel.</p>
      <label className="mt-3 block text-xs font-medium text-slate-700">Adresse courriel du canal Teams</label>
      <div className="mt-1 flex gap-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nomducanal.xxxxx@amer.teams.ms" autoComplete="off" className="bg-white" data-testid="teams-email-input" />
        <Button onClick={() => save({ teams_email: email.trim() })} disabled={!dirty || !!busy} className="bg-indigo-700 hover:bg-indigo-600" data-testid="teams-email-save-btn">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
      </div>
      <p className={`mt-1 text-xs font-medium ${user?.teams_email ? "text-emerald-700" : "text-slate-500"}`} data-testid="teams-status">{user?.teams_email ? "✓ Canal Teams configuré" : "Canal Teams non configuré"}</p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
        <Checkbox checked={!!user?.notify_email} onCheckedChange={(c) => save({ notify_email: !!c })} disabled={!!busy} data-testid="notify-email-checkbox" />
        <Mail className="h-3.5 w-3.5 text-slate-500" />Recevoir aussi l'alerte à mon courriel ({user?.email})
      </label>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={test} disabled={!!busy || (!user?.teams_email && !user?.notify_email && !user?.teams_configured)} data-testid="teams-test-btn">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" />Envoyer un test</>}</Button>
      </div>
      <button type="button" onClick={() => setShowHelp((s) => !s)} className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-800" data-testid="teams-help-toggle">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHelp ? "rotate-180" : ""}`} />Comment obtenir l'adresse courriel du canal Teams ?
      </button>
      {showHelp && <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700" data-testid="teams-help-steps">{STEPS.map((s, i) => <li key={i}>{s}</li>)}</ol>}
    </div>
  );
};
