import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { UserPlus, ShieldCheck, KeyRound, Ban, CheckCircle2, Users as UsersIcon, Mail, MailX, History, HandHelping, Monitor } from "lucide-react";
import { HelpSettings } from "@/components/HelpSettings";
import { DevicesPanel } from "@/components/DevicesPanel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeacherLayout } from "@/components/TeacherLayout";
import { ImportUsersDialog } from "@/components/ImportUsersDialog";
import { AdminJournal } from "@/components/AdminJournal";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";
import { fmtTime } from "@/lib/tools";

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join("");
};

const CreateDialog = ({ open, onOpenChange, onDone }) => {
  const [f, setF] = useState({ name: "", email: "", password: genPassword(), role: "teacher" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setF({ name: "", email: "", password: genPassword(), role: "teacher" }); }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/admin/users", f);
      toast.success(data.email_sent ? `Compte créé pour ${f.name}. Un courriel de bienvenue avec le mot de passe temporaire lui a été envoyé.` : `Compte créé pour ${f.name}. Transmettez-lui le mot de passe temporaire : ${f.password}`, { duration: 15000 });
      onDone();
      onOpenChange(false);
    } catch (err) { toast.error(formatErr(err)); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle>Nouveau compte</DialogTitle></DialogHeader>
          <div className="mt-4 space-y-3">
            <div><Label>Nom complet</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1" data-testid="create-user-name" /></div>
            <div><Label>Courriel</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1" data-testid="create-user-email" /></div>
            <div>
              <Label>Mot de passe temporaire</Label>
              <div className="mt-1 flex gap-2">
                <Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" data-testid="create-user-password" />
                <Button type="button" variant="outline" onClick={() => setF({ ...f, password: genPassword() })} data-testid="create-user-gen-password">Générer</Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">La personne devra le changer à sa première connexion.</p>
            </div>
            <div>
              <Label>Rôle</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[["teacher", "Enseignant·e"], ["admin", "Administrateur·trice"]].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setF({ ...f, role: v })} className={`rounded-md border px-3 py-2 text-sm ${f.role === v ? "border-blue-900 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600"}`} data-testid={`create-user-role-${v}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-5"><Button type="submit" disabled={saving} className="bg-blue-900 hover:bg-blue-800" data-testid="create-user-submit">Créer le compte</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const UserRow = ({ u, me, onChanged, i }) => {
  const self = u.id === me.id;
  const upd = async (body, msg) => {
    try { await api.put(`/admin/users/${u.id}`, body); toast.success(msg); onChanged(); } catch (e) { toast.error(formatErr(e)); }
  };
  const reset = async () => {
    const pwd = genPassword();
    if (!window.confirm(`Réinitialiser le mot de passe de ${u.name} ?`)) return;
    try {
      const { data } = await api.post(`/admin/users/${u.id}/reset-password`, { password: pwd });
      toast.success(data.email_sent ? `Mot de passe réinitialisé. ${u.name} a reçu le nouveau mot de passe temporaire par courriel.` : `Nouveau mot de passe temporaire pour ${u.name} : ${pwd}`, { duration: 20000 });
      onChanged();
    } catch (e) { toast.error(formatErr(e)); }
  };
  return (
    <tr className={`border-t border-slate-100 ${u.active === false ? "opacity-60" : ""}`} data-testid={`user-row-${i}`}>
      <td className="py-3 pr-3">
        <p className="font-medium text-slate-900">{u.name}{self && <span className="ml-2 text-xs text-slate-500">(vous)</span>}</p>
        <p className="text-xs text-slate-500">{u.email}</p>
      </td>
      <td className="py-3 pr-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${u.role === "admin" ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-700"}`} data-testid={`user-role-${i}`}>
          {u.role === "admin" && <ShieldCheck className="h-3 w-3" />}{u.role === "admin" ? "Admin" : "Enseignant·e"}
        </span>
      </td>
      <td className="py-3 pr-3 text-xs">
        {u.active === false ? <span className="text-rose-700" data-testid={`user-status-${i}`}>Désactivé</span> : u.must_change_password ? <span className="text-amber-700" data-testid={`user-status-${i}`}>Mot de passe temporaire</span> : <span className="text-emerald-700" data-testid={`user-status-${i}`}>Actif</span>}
        <p className="text-slate-400">Dernière connexion : {fmtTime(u.last_login_at)}</p>
      </td>
      <td className="py-3 text-right">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => upd({ role: u.role === "admin" ? "teacher" : "admin" }, "Rôle modifié")} disabled={self} data-testid={`user-toggle-role-${i}`}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />{u.role === "admin" ? "Retirer admin" : "Nommer admin"}
          </Button>
          <Button size="sm" variant="outline" onClick={reset} data-testid={`user-reset-password-${i}`}><KeyRound className="mr-1 h-3.5 w-3.5" />Mot de passe</Button>
          <Button size="sm" variant="outline" onClick={() => upd({ active: u.active === false }, u.active === false ? "Compte réactivé" : "Compte désactivé")} disabled={self}
            className={u.active === false ? "text-emerald-700" : "text-rose-700"} data-testid={`user-toggle-active-${i}`}>
            {u.active === false ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Réactiver</> : <><Ban className="mr-1 h-3.5 w-3.5" />Désactiver</>}
          </Button>
        </div>
      </td>
    </tr>
  );
};

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState("comptes");
  const [mail, setMail] = useState(null);
  const load = useCallback(() => api.get("/admin/users").then((r) => setUsers(r.data)).catch((e) => toast.error(formatErr(e))), []);
  useEffect(() => { if (user?.role === "admin") { load(); api.get("/admin/mail-status").then((r) => setMail(r.data)).catch(() => {}); } }, [user, load]);
  if (user && user.role !== "admin") return <Navigate to="/enseignant" replace />;
  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Administration</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Comptes enseignants</h1>
          <p className="mt-1 text-sm text-slate-500">Seuls les administrateurs créent les comptes. Les élèves n'ont pas de compte : ils rejoignent un examen avec son code.</p>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-users-btn"><UsersIcon className="mr-1.5 h-4 w-4" />Importer une liste</Button>
        <Button onClick={() => setOpen(true)} className="bg-blue-900 hover:bg-blue-800" data-testid="create-user-btn"><UserPlus className="mr-1.5 h-4 w-4" />Nouveau compte</Button>
      </div>
      {mail && (
        <p className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${mail.configured ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`} data-testid="mail-status">
          {mail.configured ? <><Mail className="h-4 w-4" />Courriels de bienvenue envoyés automatiquement depuis <strong>{mail.sender}</strong> (mot de passe temporaire + lien du site).</> : <><MailX className="h-4 w-4" />Messagerie non configurée : les mots de passe temporaires s'affichent à l'écran, à transmettre vous-même.</>}
        </p>
      )}
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="comptes" data-testid="tab-comptes"><UsersIcon className="mr-1.5 h-4 w-4" />Comptes</TabsTrigger>
          <TabsTrigger value="journal" data-testid="tab-journal"><History className="mr-1.5 h-4 w-4" />Journal d'activité</TabsTrigger>
          <TabsTrigger value="aide" data-testid="tab-aide"><HandHelping className="mr-1.5 h-4 w-4" />Alertes d'aide</TabsTrigger>
          <TabsTrigger value="postes" data-testid="tab-postes"><Monitor className="mr-1.5 h-4 w-4" />Postes</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "postes" ? <div className="mt-4"><DevicesPanel /></div> : tab === "aide" ? <div className="mt-4"><HelpSettings /></div> : tab === "comptes" ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <table className="w-full text-sm" data-testid="users-table">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500"><th className="pb-2 pr-3">Personne</th><th className="pb-2 pr-3">Rôle</th><th className="pb-2 pr-3">État</th><th className="pb-2 text-right">Actions</th></tr></thead>
            <tbody>{users.map((u, i) => <UserRow key={u.id} u={u} i={i} me={user} onChanged={load} />)}</tbody>
          </table>
        </div>
      ) : <div className="mt-4"><AdminJournal /></div>}
      <CreateDialog open={open} onOpenChange={setOpen} onDone={load} />
      <ImportUsersDialog open={importOpen} onOpenChange={setImportOpen} onDone={load} />
    </TeacherLayout>
  );
}
