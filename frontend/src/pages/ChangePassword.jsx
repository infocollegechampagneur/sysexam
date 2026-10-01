import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeacherLayout } from "@/components/TeacherLayout";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";

export default function ChangePassword() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const forced = !!user?.must_change_password;
  const mismatch = f.confirm && f.confirm !== f.new_password;

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/change-password", { current_password: f.current_password, new_password: f.new_password });
      setUser(data);
      toast.success("Mot de passe modifié");
      nav("/enseignant");
    } catch (err) { toast.error(formatErr(err)); } finally { setLoading(false); }
  };

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-md">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm" data-testid="change-password-form">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700"><KeyRound className="h-4 w-4" />Sécurité du compte</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{forced ? "Choisissez votre mot de passe" : "Changer mon mot de passe"}</h1>
          {forced && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="forced-change-notice">Première connexion : vous devez remplacer le mot de passe temporaire fourni par l'administrateur avant de continuer.</p>}
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="cur">Mot de passe actuel</Label>
              <Input id="cur" type="password" required autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} className="mt-1.5" data-testid="current-password-input" />
            </div>
            <div>
              <Label htmlFor="new">Nouveau mot de passe (8 caractères min.)</Label>
              <Input id="new" type="password" required minLength={8} autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} className="mt-1.5" data-testid="new-password-input" />
            </div>
            <div>
              <Label htmlFor="conf">Confirmer le nouveau mot de passe</Label>
              <Input id="conf" type="password" required autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className="mt-1.5" data-testid="confirm-password-input" />
              {mismatch && <p className="mt-1 text-xs text-rose-700" data-testid="password-mismatch">Les deux mots de passe ne correspondent pas.</p>}
            </div>
          </div>
          <Button type="submit" disabled={loading || mismatch} className="mt-6 h-11 w-full bg-blue-900 hover:bg-blue-800" data-testid="change-password-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer le mot de passe"}
          </Button>
        </form>
      </div>
    </TeacherLayout>
  );
}
