import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShieldCheck, LogOut, UserPen, KeyRound, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";

export const Brand = ({ dark = false, compact = false }) => (
  <span className="flex items-center gap-2">
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-900 text-white">
      <ShieldCheck className="h-5 w-5" />
    </span>
    <span className={`font-display text-xl font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"} ${compact ? "hidden md:inline" : ""}`}>
      MonExamEnLigne
    </span>
  </span>
);

const ProfileButton = () => {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const save = async () => {
    try {
      const { data } = await api.put("/auth/me", { name });
      setUser(data);
      setOpen(false);
      toast.success("Nom mis à jour");
    } catch (e) { toast.error(formatErr(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(user?.name || ""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-slate-700" data-testid="profile-name-btn"><UserPen className="h-4 w-4 sm:mr-1.5" /><span className="hidden max-w-[140px] truncate sm:inline">{user?.name}</span></Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nom de l'enseignant</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">Ce nom est affiché automatiquement aux élèves pour les examens liés à une liste de classe.</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" />
        <DialogFooter><Button onClick={save} disabled={!name.trim()} className="bg-blue-900 hover:bg-blue-800" data-testid="profile-name-save-btn">Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TeacherLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/enseignant" data-testid="nav-home-link"><Brand compact /></Link>
          <div className="flex items-center gap-3">
            <NavLink to="/enseignant" end className={({ isActive }) => `text-sm font-medium ${isActive ? "text-blue-900" : "text-slate-500 hover:text-slate-900"}`} data-testid="nav-exams-link">Examens</NavLink>
            <NavLink to="/enseignant/classes" className={({ isActive }) => `text-sm font-medium ${isActive ? "text-blue-900" : "text-slate-500 hover:text-slate-900"}`} data-testid="nav-classes-link">Classes</NavLink>
            {user?.role === "admin" && <NavLink to="/enseignant/comptes" className={({ isActive }) => `text-sm font-medium ${isActive ? "text-blue-900" : "text-slate-500 hover:text-slate-900"}`} data-testid="nav-users-link">Comptes</NavLink>}
            <NavLink to="/enseignant/mot-de-passe" className={({ isActive }) => `mr-2 text-sm font-medium ${isActive ? "text-blue-900" : "text-slate-500 hover:text-slate-900"}`} title="Changer mon mot de passe" data-testid="nav-password-link"><KeyRound className="h-4 w-4" /></NavLink>
            <ProfileButton />
            <span className="hidden text-sm text-slate-500 lg:inline" data-testid="nav-user-email">{user?.email}</span>
            <Button variant="ghost" size="sm" asChild data-testid="nav-student-space-link">
              <Link to="/" title="Aller à l'espace élève (vous restez connecté)"><GraduationCap className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Espace élève</span></Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="logout-btn"
              onClick={async () => { await logout(); nav("/"); }}
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 fade-up">{children}</main>
    </div>
  );
};
