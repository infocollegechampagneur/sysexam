import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brand } from "@/components/TeacherLayout";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";

export default function Login() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/enseignant" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post(mode === "login" ? "/auth/login" : "/auth/register", f);
      setUser(data);
      nav("/enseignant");
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
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Connexion</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Créer un compte</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-6 space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Nom</Label>
                <Input id="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1.5" data-testid="register-name-input" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Courriel</Label>
              <Input id="email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1.5" data-testid="auth-email-input" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1.5" data-testid="auth-password-input" />
            </div>
          </div>
          {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="auth-error">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-6 h-11 w-full bg-blue-900 hover:bg-blue-800" data-testid="teacher-login-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>
      </div>
    </div>
  );
}
