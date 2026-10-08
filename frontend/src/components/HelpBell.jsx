import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, formatErr } from "@/lib/api";
import { playAlert, flashTitle, stopFlash } from "@/lib/alertSound";

const since = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "à l'instant" : `il y a ${m} min`;
};

export const useHelpRequests = (examId = "") => {
  const [items, setItems] = useState([]);
  const seen = useRef(null);
  const load = useCallback(() => api.get("/help-requests", { params: { status: "open", exam_id: examId } }).then((r) => {
    if (seen.current) {
      const fresh = r.data.filter((h) => !seen.current.has(h.id));
      fresh.forEach((h) => toast.warning(`🙋 ${h.student_name} a besoin d'aide (${h.exam_title})${h.reason ? ` — ${h.reason}` : ""}`, { duration: 15000 }));
      if (fresh.length && !examId) { playAlert(); flashTitle(`${fresh[0].student_name} a besoin d'aide`, r.data.length); }
    }
    if (!r.data.length) stopFlash();
    seen.current = new Set(r.data.map((h) => h.id));
    setItems(r.data);
  }).catch(() => {}), [examId]);
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, [load]);
  const handle = async (id) => {
    try { await api.put(`/help-requests/${id}/handle`); toast.success("Demande prise en charge"); load(); } catch (e) { toast.error(formatErr(e)); }
  };
  return { items, handle, reload: load };
};

export const HelpRequestRow = ({ h, i, onHandle, dark = false }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${dark ? "border-amber-700 bg-amber-950/40" : "border-amber-200 bg-amber-50"}`} data-testid={`help-request-${i}`}>
      <div className="min-w-0 flex-1 text-sm">
        <p className={`font-semibold ${dark ? "text-amber-100" : "text-slate-900"}`}>{h.student_name} <span className={`font-normal ${dark ? "text-amber-300/70" : "text-slate-500"}`}>· {since(h.created_at)}</span></p>
        <p className={`truncate text-xs ${dark ? "text-amber-200/80" : "text-slate-600"}`}>{h.exam_title}{h.reason ? ` — ${h.reason}` : ""}</p>
      </div>
      <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await onHandle(h.id); setBusy(false); }} className="h-8 bg-emerald-600 hover:bg-emerald-500" data-testid={`help-handle-${i}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Pris en charge</>}
      </Button>
    </div>
  );
};

export const HelpBell = () => {
  const { items, handle } = useHelpRequests();
  const n = items.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Demandes d'aide des élèves" data-testid="help-bell-btn">
          <Bell className={`h-5 w-5 ${n ? "text-amber-600" : "text-slate-500"}`} />
          {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white animate-pulse" data-testid="help-bell-count">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3" data-testid="help-bell-panel">
        <p className="mb-2 text-sm font-semibold text-slate-900">Demandes d'aide en attente</p>
        {!n && <p className="py-4 text-center text-sm text-slate-500" data-testid="help-bell-empty">Aucune demande en attente.</p>}
        <div className="max-h-80 space-y-2 overflow-y-auto">{items.map((h, i) => <HelpRequestRow key={h.id} h={h} i={i} onHandle={handle} />)}</div>
      </PopoverContent>
    </Popover>
  );
};
