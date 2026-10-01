import { ClipboardCopy, ClipboardPaste, Globe, AppWindow, Minimize, Keyboard, MousePointerClick, Clock, Bot } from "lucide-react";

export const CATS = [
  { key: "copy", label: "Copier / couper", icon: ClipboardCopy, types: ["copy_attempt", "cut_attempt"] },
  { key: "paste", label: "Coller", icon: ClipboardPaste, types: ["paste_attempt"] },
  { key: "tab", label: "Autre onglet ou site web", icon: Globe, types: ["tab_hidden"] },
  { key: "app", label: "Autre fenêtre ou application", icon: AppWindow, types: ["window_blur"] },
  { key: "fs", label: "Sortie du plein écran", icon: Minimize, types: ["fullscreen_exit"] },
  { key: "keys", label: "Raccourcis / outils dév. / capture", icon: Keyboard, types: ["shortcut", "devtools", "print_attempt"] },
  { key: "ctx", label: "Clic droit", icon: MousePointerClick, types: ["contextmenu"] },
  { key: "forbidden", label: "Applications interdites (navigateur, IA…)", icon: Bot, types: ["forbidden_app"] },
];

export const ActivitySummary = ({ events }) => {
  const away = events.filter((e) => e.type === "returned" && e.seconds).reduce((a, e) => a + e.seconds, 0);
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="activity-summary">
      {CATS.map((c) => {
        const n = events.filter((e) => c.types.includes(e.type)).length;
        return (
          <div key={c.key} className={`rounded-lg border px-3 py-2 ${n ? "border-rose-200 bg-white" : "border-slate-200 bg-white/60"}`} data-testid={`activity-${c.key}`}>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><c.icon className="h-3.5 w-3.5" />{c.label}</div>
            <p className={`mt-0.5 font-display text-xl font-bold ${n ? "text-rose-700" : "text-slate-300"}`}>{n}</p>
          </div>
        );
      })}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid="activity-away-time">
        <div className="flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />Temps hors de l'examen</div>
        <p className={`mt-0.5 font-display text-xl font-bold ${away ? "text-rose-700" : "text-slate-300"}`}>{away >= 60 ? `${Math.floor(away / 60)} min ${Math.round(away % 60)} s` : `${Math.round(away)} s`}</p>
      </div>
    </div>
  );
};
