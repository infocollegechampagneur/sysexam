import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LogIn, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, formatErr } from "@/lib/api";
import { fmtTime, STATUS_LABELS, EXAM_TYPES } from "@/lib/tools";

const Row = ({ u, i }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid={`journal-row-${i}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left" data-testid={`journal-toggle-${i}`}>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <div className="flex-1 min-w-0">
          <p className="truncate font-medium text-slate-900">{u.name} <span className="text-xs font-normal text-slate-500">{u.email}</span></p>
          <p className="text-xs text-slate-500">Dernière connexion : {fmtTime(u.last_login_at)}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700" data-testid={`journal-logins-${i}`}><LogIn className="h-3 w-3" />{u.login_count} connexion(s)</span>
        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-900" data-testid={`journal-exams-${i}`}><FileText className="h-3 w-3" />{u.exams.length} examen(s)</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Examens créés</p>
            {!u.exams.length && <p className="text-sm text-slate-400">Aucun examen.</p>}
            <ul className="space-y-1.5 text-sm">
              {u.exams.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-md border border-slate-100 px-2.5 py-1.5">
                  <span className="flex-1 truncate text-slate-800">{e.title}</span>
                  <span className="text-xs text-slate-500">{EXAM_TYPES.find((t) => t.id === e.exam_type)?.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${e.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{STATUS_LABELS[e.status]}</span>
                  <span className="font-mono text-xs text-slate-500">{e.submitted}/{e.sessions} copies</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Dernières connexions</p>
            {!u.logins.length && <p className="text-sm text-slate-400">Aucune connexion enregistrée.</p>}
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
              {u.logins.map((l, j) => <li key={j} className="flex justify-between rounded-md bg-slate-50 px-2 py-1"><span>{fmtTime(l.at)}</span><span className="font-mono text-slate-400">{l.ip}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminJournal = () => {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/admin/activity").then((r) => setRows(r.data)).catch((e) => toast.error(formatErr(e))); }, []);
  if (!rows) return <p className="text-sm text-slate-500">Chargement du journal…</p>;
  return <div className="space-y-2" data-testid="admin-journal">{rows.map((u, i) => <Row key={u.id} u={u} i={i} />)}</div>;
};
