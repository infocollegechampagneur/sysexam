import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/TeacherLayout";
import { api, formatErr } from "@/lib/api";


const JoinCard = () => {
  const nav = useNavigate();
  const [f, setF] = useState({ code: "", student_name: "", student_number: "", teacher_name: "" });
  const [loading, setLoading] = useState(false);
  const [autoTeacher, setAutoTeacher] = useState(false);
  const autoRef = useRef(false);

  useEffect(() => {
    const reset = () => { if (autoRef.current) { autoRef.current = false; setAutoTeacher(false); setF((x) => ({ ...x, teacher_name: "" })); } };
    if (f.code.length !== 6) return reset();
    api.get(`/student/exam-info/${f.code}`).then(({ data }) => {
      if (!data.roster) return reset();
      autoRef.current = true;
      setAutoTeacher(true);
      setF((x) => ({ ...x, teacher_name: data.teacher_name || "" }));
    }).catch(() => {});
  }, [f.code]);
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
          <Label htmlFor="num">Code permanent / matricule (si votre enseignant·e l'exige)</Label>
          <Input id="num" value={f.student_number} onChange={(e) => setF({ ...f, student_number: e.target.value })} className="mt-1.5" data-testid="student-number-input" />
        </div>
        <div>
          <Label htmlFor="teacher">Nom de l'enseignant</Label>
          <Input id="teacher" value={f.teacher_name} readOnly={autoTeacher} onChange={(e) => setF({ ...f, teacher_name: e.target.value })}
            className={`mt-1.5 ${autoTeacher ? "bg-slate-100 text-slate-700" : ""}`} data-testid="teacher-name-input" />
          {autoTeacher && <p className="mt-1 text-xs text-emerald-700" data-testid="teacher-name-auto-hint">Rempli automatiquement d'après la liste de classe.</p>}
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
          <Button variant="outline" size="sm" className="border-blue-900 text-blue-900 hover:bg-blue-50 sm:h-10 sm:px-4" data-testid="teacher-login-link">
            Espace enseignant
          </Button>
        </Link>
      </header>
      <main className="grid place-items-center px-4 pb-20 pt-8 lg:pt-16">
        <section className="w-full max-w-md fade-up">
          <JoinCard />
        </section>
      </main>
    </div>
  );
}
