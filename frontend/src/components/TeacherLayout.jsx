import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export const Brand = ({ dark = false }) => (
  <span className="flex items-center gap-2">
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-900 text-white">
      <ShieldCheck className="h-5 w-5" />
    </span>
    <span className={`font-display text-xl font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
      ÉxamSécure
    </span>
  </span>
);

export const TeacherLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/enseignant" data-testid="nav-home-link"><Brand /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline" data-testid="nav-user-email">{user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              data-testid="logout-btn"
              onClick={async () => { await logout(); nav("/"); }}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 fade-up">{children}</main>
    </div>
  );
};
