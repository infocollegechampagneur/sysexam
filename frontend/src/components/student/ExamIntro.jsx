import { ShieldCheck, Globe, Monitor, Ban, Maximize, ClipboardX, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOOLS } from "@/lib/tools";

const RULES = [
  { icon: Maximize, text: "L'examen se déroule en plein écran. En sortir est une infraction." },
  { icon: Eye, text: "Changer d'onglet ou de fenêtre est détecté et enregistré." },
  { icon: ClipboardX, text: "Copier, coller et le clic droit sont désactivés." },
];

export const ExamIntro = ({ exam, session, onStart }) => {
  const st = exam.settings;
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
            {rules.map((r) => <li key={r.text} className="flex gap-2"><r.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{r.text}</li>)}
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
      <Button onClick={onStart} className="mt-10 h-12 w-full bg-blue-600 text-base hover:bg-blue-500" data-testid="start-exam-btn">
        {st.require_fullscreen ? "Passer en plein écran et commencer" : "Commencer l'examen"}
      </Button>
    </div>
  );
};
