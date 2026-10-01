import { useState } from "react";
import { ClipboardPaste, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

export const pasteVerdict = (ev) => {
  const sim = ev.similarity ?? 0;
  if (!ev.before_words) return { label: "Zone vide avant le collage", tone: ev.suspect ? "rose" : "slate" };
  if (sim >= 70) return { label: `${sim} % de mots déjà écrits — ressemble à une correction`, tone: "emerald" };
  if (sim >= 40) return { label: `${sim} % de mots déjà écrits — texte partiellement remanié`, tone: "amber" };
  return { label: `${sim} % de mots déjà écrits — texte NOUVEAU, source externe possible`, tone: "rose" };
};

const TONE = { emerald: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", rose: "bg-rose-100 text-rose-800", slate: "bg-slate-100 text-slate-700" };

const PasteItem = ({ ev, i }) => {
  const [open, setOpen] = useState(false);
  const words = ev.words ?? (ev.text.trim().match(/\S+/g) || []).length;
  const long = ev.text.length > 220;
  const v = pasteVerdict(ev);
  return (
    <li className={`rounded-lg border bg-white px-3 py-2 text-sm ${ev.suspect ? "border-rose-300" : "border-amber-200"}`} data-testid={`paste-item-${i}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono">{new Date(ev.at).toLocaleTimeString("fr-CA")}</span>
        <span className={`font-medium ${ev.suspect ? "text-rose-700" : "text-slate-700"}`} data-testid={`paste-words-${i}`}>{words} mot(s) collé(s)</span>
        {ev.suspect && <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-white" data-testid={`paste-suspect-${i}`}><AlertTriangle className="h-3 w-3" />Collage important</span>}
        <span className={`rounded-full px-2 py-0.5 ${TONE[v.tone]}`} data-testid={`paste-verdict-${i}`}>{v.label}</span>
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto flex items-center gap-1 text-blue-800 hover:underline" data-testid={`paste-toggle-${i}`}>
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
  const suspects = pastes.filter((p) => p.suspect).length;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="paste-history">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900"><ClipboardPaste className="h-4 w-4" />Texte collé dans la zone de réponse ({pastes.length}){suspects > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white" data-testid="paste-suspect-count">{suspects} collage(s) de 40 mots ou plus</span>}</p>
      <p className="mb-3 text-xs text-amber-800">Collages permis par un logiciel d'aide (Antidote, WordQ, Lexibar). Le pourcentage indique la part des mots collés qui étaient déjà dans la réponse : élevé = correction de son propre texte ; faible = texte nouveau.</p>
      <ol className="max-h-72 space-y-2 overflow-y-auto pr-2">
        {[...pastes].reverse().map((ev, i) => <PasteItem key={i} ev={ev} i={i} />)}
      </ol>
    </section>
  );
};
