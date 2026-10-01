import { useState } from "react";
import { ClipboardPaste, ChevronDown, ChevronUp } from "lucide-react";

const PasteItem = ({ ev, i }) => {
  const [open, setOpen] = useState(false);
  const words = (ev.text.trim().match(/\S+/g) || []).length;
  const long = ev.text.length > 220;
  return (
    <li className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" data-testid={`paste-item-${i}`}>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-mono">{new Date(ev.at).toLocaleTimeString("fr-CA")}</span>
        <span className={`font-medium ${words >= 40 ? "text-rose-700" : "text-slate-700"}`}>{words} mot(s) collé(s)</span>
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto flex items-center gap-1 text-blue-800 hover:underline" data-testid={`paste-toggle-${i}`}>
            {open ? <><ChevronUp className="h-3 w-3" />Réduire</> : <><ChevronDown className="h-3 w-3" />Tout afficher</>}
          </button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">{open || !long ? ev.text : `${ev.text.slice(0, 220)}…`}</p>
    </li>
  );
};

export const PasteHistory = ({ events }) => {
  const pastes = (events || []).filter((ev) => ev.type === "clipboard_tool" && ev.text);
  if (!pastes.length) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="paste-history">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900"><ClipboardPaste className="h-4 w-4" />Texte collé dans la zone de réponse ({pastes.length})</p>
      <p className="mb-3 text-xs text-amber-800">Collages permis par un logiciel d'aide (Antidote, WordQ, Lexibar). Un long passage très différent du reste de la copie peut indiquer une source externe.</p>
      <ol className="max-h-72 space-y-2 overflow-y-auto pr-2">
        {[...pastes].reverse().map((ev, i) => <PasteItem key={i} ev={ev} i={i} />)}
      </ol>
    </section>
  );
};
