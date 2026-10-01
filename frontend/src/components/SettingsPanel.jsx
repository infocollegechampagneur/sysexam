import { Info, Globe, Monitor } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TOOLS } from "@/lib/tools";

const Row = ({ title, desc, checked, onChange, testId }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300">
    <span>
      <span className="block text-sm font-medium text-slate-900">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
  </label>
);

export const SettingsPanel = ({ settings, onChange }) => {
  const set = (k, v) => onChange({ ...settings, [k]: v });
  const toggleTool = (id, on) => set("allowed_tools", on ? [...settings.allowed_tools, id] : settings.allowed_tools.filter((t) => t !== id));
  return (
    <div className="space-y-8" data-testid="settings-panel">
      <section>
        <h3 className="font-display text-lg font-semibold text-slate-900">Outils d'aide autorisés</h3>
        <p className="mt-1 text-sm text-slate-500">Seuls les outils activés seront proposés à l'élève pendant l'examen.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {TOOLS.map((t) => (
            <Row key={t.id} title={<span className="flex items-center gap-1.5">{t.kind === "web" ? <Globe className="h-3.5 w-3.5 text-blue-700" /> : <Monitor className="h-3.5 w-3.5 text-blue-700" />}{t.label}</span>}
              desc={t.desc} checked={settings.allowed_tools.includes(t.id)} onChange={(v) => toggleTool(t.id, v)} testId={`tool-toggle-${t.id}`} />
          ))}
        </div>
      </section>
      <section>
        <h3 className="font-display text-lg font-semibold text-slate-900">Sécurité</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Row title="Plein écran obligatoire" desc="L'examen est masqué tant que l'élève n'est pas en plein écran." checked={settings.require_fullscreen} onChange={(v) => set("require_fullscreen", v)} testId="setting-require-fullscreen" />
          <Row title="Bloquer copier / coller" desc="Copier, couper, coller, glisser-déposer et clic droit désactivés." checked={settings.block_clipboard} onChange={(v) => set("block_clipboard", v)} testId="setting-block-clipboard" />
          <Row title="Verrouiller après le seuil" desc="La copie est verrouillée lorsque le nombre maximal d'infractions est atteint." checked={settings.lock_on_max} onChange={(v) => set("lock_on_max", v)} testId="setting-lock-on-max" />
          <Row title="Correcteur du navigateur" desc="Autoriser le soulignement orthographique intégré au navigateur." checked={settings.browser_spellcheck} onChange={(v) => set("browser_spellcheck", v)} testId="setting-browser-spellcheck" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Label htmlFor="maxv" className="text-sm">Nombre maximal d'infractions</Label>
          <Input id="maxv" type="number" min={1} max={50} value={settings.max_violations} onChange={(e) => set("max_violations", Math.max(1, Number(e.target.value)))} className="w-24" data-testid="setting-max-violations" />
        </div>
      </section>
      <div className="flex gap-3 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900" data-testid="settings-limits-note">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Un site web ne peut pas couper Internet ni fermer les autres logiciels de l'ordinateur. MonExamEnLigne bloque le presse-papier, impose le plein écran et <strong>détecte et consigne chaque sortie</strong> de la fenêtre. Les logiciels permis (Antidote, WordQ, Lexibar) ne comptent pas comme infraction. Pour un blocage total du poste, combinez avec Safe Exam Browser ou la gestion des postes de l'école.
        </p>
      </div>
    </div>
  );
};
