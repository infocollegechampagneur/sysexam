import { useState } from "react";
import { ChevronDown } from "lucide-react";

export const TEAMS_STEPS = [
  "Dans Teams, ouvrez le canal OU le clavardage de groupe où vous voulez recevoir les alertes.",
  "Cliquez sur « ⋯ » (à côté du nom du canal, ou en haut du clavardage) → « Flux de travail » (Workflows).",
  "Choisissez « Publier dans un canal lorsqu'une demande de webhook est reçue » (ou « …dans une conversation… » pour un clavardage).",
  "Laissez « Tout le monde » comme option d'authentification, cliquez « Ajouter le flux de travail », puis « Copier » le lien.",
  "Collez le lien ci-dessus, enregistrez, puis « Tester » : une carte apparaît dans Teams en quelques secondes.",
  "Toutes les personnes membres de ce canal ou de ce clavardage voient l'alerte : inutile de configurer chaque collègue.",
];

export const TeamsHelpSteps = ({ testId = "teams-help" }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((s) => !s)} className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-800" data-testid={`${testId}-toggle`}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />Comment obtenir le lien Teams ?
      </button>
      {open && <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700" data-testid={`${testId}-steps`}>{TEAMS_STEPS.map((s, i) => <li key={i}>{s}</li>)}</ol>}
    </>
  );
};
