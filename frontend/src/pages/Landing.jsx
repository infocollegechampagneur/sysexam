import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, ClipboardX, MonitorX, BookOpenCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/TeacherLayout";
import { api, formatErr } from "@/lib/api";

const features = [
  { icon: ClipboardX, title: "Presse-papier verrouillé", text: "Copier, couper et coller sont bloqués et consignés." },
  { icon: MonitorX, title: "Changement d'onglet détecté", text: "Chaque sortie de la fenêtre est horodatée et comptée." },
  { icon: BookOpenCheck, title: "Outils d'aide au choix", text: "Antidote, WordQ, Lexibar, Usito, WordReference : l'enseignant décide." },
];

const JoinCard = () => {
  const nav = useNavigate();
  const [f, setF] = useState({ code: "", student_name: "", student_number: "" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/student/join", f);
      sessionStorage.setItem("exam_token", data.token);
      nav("/examen");
    } catch (err) {
      toast.error(formatErr(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-blue-900/5" data-testid="student-join-form">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Espace élève</p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">Rejoindre un examen</h2>
      <div className="mt-6 space-y-4">
        <div>
          <Label htmlFor="code">Code d'examen</Label>
          <Input id="code" required maxLength={6} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
            placeholder="EX. FRA401" className="mt-1.5 h-14 text-center font-mono text-2xl tracking-[0.4em]" data-testid="student-join-code-input" />
        </div>
        <div>
          <Label htmlFor="name">Nom complet</Label>
          <Input id="name" required value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} className="mt-1.5" data-testid="student-name-input" />
        </div>
        <div>
          <Label htmlFor="num">Code permanent / matricule (facultatif)</Label>
          <Input id="num" value={f.student_number} onChange={(e) => setF({ ...f, student_number: e.target.value })} className="mt-1.5" data-testid="student-number-input" />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="mt-6 h-12 w-full bg-blue-900 text-base hover:bg-blue-800" data-testid="student-join-submit-btn">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Accéder à l'examen <ArrowRight className="ml-2 h-4 w-4" /></>}
      </Button>
    </form>
  );
};

export default function Landing() {
  return (
    <div className="min-h-screen grid-paper">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Brand />
        <Link to="/connexion">
          <Button variant="outline" className="border-blue-900 text-blue-900 hover:bg-blue-50" data-testid="teacher-login-link">
            Espace enseignant
          </Button>
        </Link>
      </header>
      <main className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-12 lg:px-8 lg:pt-16">
        <section className="lg:col-span-7 fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-800">
            <Lock className="h-3.5 w-3.5" /> Évaluation en environnement contrôlé
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Des examens en ligne<br />
            <span className="text-blue-900">sans plagiat</span>, sans détour.
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-600 md:text-lg">
            Formulaires, rédactions ou vos propres documents Word et PDF. Plein écran obligatoire, presse-papier bloqué, et seulement les outils d'aide que vous autorisez.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {features.map((f, i) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur fade-up" style={{ animationDelay: `${120 * (i + 1)}ms` }}>
                <f.icon className="h-5 w-5 text-blue-900" />
                <p className="mt-3 text-sm font-semibold text-slate-900">{f.title}</p>
                <p className="mt-1 text-sm text-slate-500">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="lg:col-span-5 fade-up" style={{ animationDelay: "200ms" }}>
          <JoinCard />
        </section>
      </main>
    </div>
  );
}
