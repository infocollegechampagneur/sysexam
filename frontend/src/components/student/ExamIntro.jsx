import { useState } from "react";
import { ShieldCheck, Globe, Monitor, Ban, Maximize, ClipboardX, Eye, SpellCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOOLS } from "@/lib/tools";
import { PreCheck } from "@/components/student/PreCheck";

const ANTIDOTE_STEPS = [
  "Rédigez votre texte directement dans la zone de réponse de l'examen.",
  "Cliquez sur le bouton vert « Corriger avec Antidote » dans la barre de l'éditeur.",
  "Le correcteur Antidote s'ouvre avec votre texte : appliquez les corrections comme d'habitude.",
  "Chaque correction acceptée est appliquée immédiatement dans votre zone de réponse.",
  "Fermez le correcteur pour revenir à l'examen. (Solution de rechange : sélectionnez le texte et appuyez sur Ctrl+C+C.)",
];

const RULES = [
  { icon: Maximize, text: "L'examen se déroule en plein écran. En sortir est une infraction." },
  { icon: Eye, text: "Changer d'onglet ou de fenêtre est détecté et enregistré." },
  { icon: ClipboardX, text: "Copier, coller et le clic droit sont désactivés.", internal: "Le copier-coller n'est permis qu'avec du texte provenant de l'examen ; coller un texte externe est bloqué et signalé." },
];

export const ExamIntro = ({ exam, session, onStart, sapi }) => {
  const st = exam.settings;
  const desktop = !!window.monExam?.forbiddenApps;
  const [clean, setClean] = useState(!desktop);
  const allowed = TOOLS.filter((t) => st.allowed_tools.includes(t.id));
  const rules = RULES.filter((_, i) => (i === 0 ? st.require_fullscreen : i === 2 ? st.block_clipboard : true));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 fade-up" data-testid="exam-intro">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Bonjour {session.student_name}</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl" data-testid="exam-intro-title">{exam.title}</h1>
      <p className="mt-2 text-slate-400">{exam.subject} · {exam.duration_minutes ? `${exam.duration_minutes} minutes` : "Sans limite de temps"}{exam.duration_minutes > 0 && session.extra_time_percent > 0 && <span className="text-emerald-400" data-testid="intro-extra-time"> · +{session.extra_time_percent} % de temps (plan d'intervention)</span>}</p>
      {exam.instructions && <p className="mt-6 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-200">{exam.instructions}</p>}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4 text-blue-400" />Règles de l'examen</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {rules.map((r) => <li key={r.text} className="flex gap-2"><r.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{r.internal && st.clipboard_internal !== false ? r.internal : r.text}</li>)}
            <li className="flex gap-2"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />Après {st.max_violations} infraction(s), {st.lock_on_max ? "la copie est verrouillée." : "l'enseignant est alerté."}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5" data-testid="exam-intro-tools">
          <p className="font-semibold text-white">Outils permis</p>
          <div className="mt-4 space-y-2">
            {allowed.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                {t.kind === "web" ? <Globe className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}{t.label}
                <span className="ml-auto text-xs text-emerald-400/80">{t.kind === "web" ? "bouton dans l'examen" : "logiciel du poste"}</span>
              </div>
            ))}
            {!allowed.length && <p className="text-sm text-slate-400">Aucun outil d'aide n'est permis pour cet examen.</p>}
          </div>
        </div>
      </div>
      {st.allowed_tools.includes("antidote") && (
        <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/30 p-5" data-testid="antidote-guide">
          <p className="flex items-center gap-2 font-semibold text-emerald-200"><SpellCheck className="h-4 w-4" />Comment corriger avec Antidote sans infraction</p>
          <ol className="mt-3 space-y-2 text-sm text-emerald-100/90">
            {ANTIDOTE_STEPS.map((s, i) => <li key={i} className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-700 font-mono text-xs font-bold text-white">{i + 1}</span>{s}</li>)}
          </ol>
          <p className="mt-3 text-xs text-emerald-300/80">Le copier-coller est permis <strong>seulement dans votre zone de réponse</strong>. Chaque collage est noté et visible par l'enseignant : ne collez que votre propre texte corrigé. Copier l'énoncé, ouvrir un autre site ou une autre application reste une infraction.</p>
          <p className="mt-2 rounded-md bg-emerald-900/40 px-3 py-2 text-xs text-emerald-100" data-testid="antidote-agent-hint"><strong>Si Ctrl+C+C ne réagit pas :</strong> l'Agent Antidote n'est pas activé sur ce poste. Ouvrez Antidote → menu <em>Outils</em> (ou <em>Antidote</em>) → <em>Réglages</em> → <em>Connectix</em> → cochez <em>Activer l'Agent Antidote</em>. Une fois fait, le raccourci fonctionne dans toutes les applications.</p>
        </div>
      )}
      {desktop && <PreCheck onClean={setClean} sapi={sapi} allowedTools={(st.allowed_tools || []).filter((id) => TOOLS.find((t) => t.id === id)?.kind === "desktop")} />}
      <Button onClick={onStart} disabled={!clean} className="mt-10 h-12 w-full bg-blue-600 text-base hover:bg-blue-500" data-testid="start-exam-btn">
        {st.require_fullscreen ? "Passer en plein écran et commencer" : "Commencer l'examen"}
      </Button>
    </div>
  );
};
