import { useState } from "react";
import { MessageSquare, Send, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatErr } from "@/lib/api";

const STEPS = [
  "Dans Teams, ouvrez le canal (ou la conversation) où vous voulez recevoir les alertes.",
  "Cliquez sur « ⋯ » à côté du nom du canal → « Workflows » (Flux de travail).",
  "Choisissez le modèle « Publier dans un canal lorsqu'une demande de webhook est reçue » (« Post to a channel when a webhook request is received »).",
  "Donnez-lui un nom (ex. : Alertes MonExamEnLigne), choisissez l'équipe et le canal, puis « Ajouter le flux ».",
  "Copiez l'URL affichée (elle commence par https://… .logic.azure.com/… ou …powerautomate.com/…) et collez-la ci-dessous.",
  "Cliquez sur « Enregistrer » puis « Tester » : une carte doit apparaître dans Teams.",
];

export const TeamsSettings = ({ user, setUser }) => {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const save = async (value) => {
    setBusy("save");
    try { const { data } = await api.put("/auth/me", { name: user.name, teams_webhook: value }); setUser(data); setUrl(""); toast.success(value ? "Webhook Teams enregistré" : "Webhook Teams retiré"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try { await api.post("/auth/me/teams-test"); toast.success("Message de test envoyé : vérifiez votre canal Teams."); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4" data-testid="teams-settings">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4 text-indigo-700" />Alertes d'aide dans Microsoft Teams</p>
      <p className="mt-1 text-xs text-slate-600">Collez l'URL de webhook d'un flux Teams : quand un élève clique « J'ai besoin d'aide », vous recevez une carte dans Teams. L'URL n'est jamais réaffichée.</p>
      <p className={`mt-2 text-xs font-medium ${user?.teams_configured ? "text-emerald-700" : "text-slate-500"}`} data-testid="teams-status">{user?.teams_configured ? "✓ Teams configuré" : "Non configuré"}</p>
      <div className="mt-2 flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoComplete="off" className="bg-white" data-testid="teams-webhook-input" />
        <Button onClick={() => save(url.trim())} disabled={!url.trim() || !!busy} className="bg-indigo-700 hover:bg-indigo-600" data-testid="teams-webhook-save-btn">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
      </div>
      {user?.teams_configured && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={test} disabled={!!busy} data-testid="teams-webhook-test-btn">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" />Tester</>}</Button>
          <Button size="sm" variant="ghost" onClick={() => save("")} disabled={!!busy} className="text-rose-700" data-testid="teams-webhook-remove-btn">Retirer</Button>
        </div>
      )}
      <button type="button" onClick={() => setShowHelp((s) => !s)} className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-800" data-testid="teams-help-toggle">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHelp ? "rotate-180" : ""}`} />Comment obtenir l'URL dans Teams ?
      </button>
      {showHelp && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700" data-testid="teams-help-steps">
          {STEPS.map((s, i) => <li key={i}>{s}</li>)}
          <li>Si « Workflows » n'apparaît pas, l'application Workflows (Power Automate) doit être activée par l'administrateur Microsoft 365 dans le centre d'administration Teams → Applications Teams.</li>
        </ol>
      )}
    </div>
  );
};
