import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/TeacherLayout";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";

export default function Login() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.must_change_password ? "/enseignant/mot-de-passe" : "/enseignant"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", f);
      setUser(data);
      nav(data.must_change_password ? "/enseignant/mot-de-passe" : "/enseignant");
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-paper place-items-center px-4">
      <div className="w-full max-w-md fade-up">
        <Link to="/" className="mb-8 flex justify-center" data-testid="login-home-link"><Brand /></Link>
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-blue-900/5" data-testid="teacher-auth-form">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Espace enseignant</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">Connexion</h1>
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Courriel</Label>
              <Input id="email" type="email" required autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1.5" data-testid="auth-email-input" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1.5" data-testid="auth-password-input" />
            </div>
          </div>
          {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="auth-error">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-6 h-11 w-full bg-blue-900 hover:bg-blue-800" data-testid="teacher-login-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
          </Button>
          <p className="mt-5 text-center text-xs text-slate-500" data-testid="no-register-notice">Les comptes sont créés par l'administrateur de votre école. Pas de compte ? Adressez-vous à lui.</p>
        </form>
        <Link to="/" className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-blue-900" data-testid="login-back-link"><ArrowLeft className="h-4 w-4" />Retour à l'accueil (espace élève)</Link>
      </div>
    </div>
  );
}
