import { useEffect, useState } from "react";
import { RefreshCw, Database, HardDrive, Globe, Archive, Mail, Server, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, formatErr } from "@/lib/api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");
const ageH = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : null);

const Status = ({ ok, warn }) => ok === null || ok === undefined
  ? <span className="text-xs text-slate-400">non vérifié</span>
  : ok ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />OK</span>
  : warn ? <span className="flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" />Attention</span>
  : <span className="flex items-center gap-1 text-xs font-semibold text-rose-700"><XCircle className="h-4 w-4" />Problème</span>;

const Card = ({ icon: Icon, title, ok, warn, children, testId }) => (
  <div className={`rounded-xl border bg-white p-4 ${ok === false && !warn ? "border-rose-300" : warn ? "border-amber-300" : "border-slate-200"}`} data-testid={testId}>
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon className="h-4 w-4 text-blue-800" />{title}</span>
      <Status ok={ok} warn={warn} />
    </div>
    <div className="mt-2 space-y-0.5 text-sm text-slate-600">{children}</div>
  </div>
);

export const ServerHealthPanel = () => {
  const [h, setH] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); setErr(""); api.get("/admin/health").then((r) => setH(r.data)).catch((e) => { setErr(formatErr(e)); toast.error(formatErr(e)); }).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, []);
  if (!h) return err
    ? <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" data-testid="server-health-error">Impossible d'interroger le serveur : {err} <Button size="sm" variant="outline" className="ml-3" onClick={load} data-testid="health-retry-btn">Réessayer</Button></div>
    : <p className="py-8 text-center text-sm text-slate-500">Vérification du serveur…</p>;
  const bAge = ageH(h.backup.last_at);
  const backupOk = h.db.atlas ? true : bAge !== null && bAge < 30;
  const diskWarn = h.disk.used_pct >= 80;
  return (
    <div data-testid="server-health-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Vérifié le {fmt(h.time)} · version du code <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs" data-testid="health-version">{h.version}</code> · démarré le {fmt(h.started_at)} · {h.workers} processus</p>
        <Button size="sm" variant="outline" onClick={load} disabled={busy} data-testid="health-refresh-btn"><RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Revérifier</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon={Database} title="Base de données" ok={h.db.ok} testId="health-db">
          <p>{h.db.atlas ? "MongoDB Atlas (infonuagique)" : "MongoDB local (Docker)"} · <code>{h.db.name}</code>{h.db.ms != null && <> · {h.db.ms} ms</>}</p>
          {h.db.ok && <p>{h.db.counts.users} comptes · {h.db.counts.exams} examens · {h.db.counts.sessions} copies · {h.db.counts.classes} classes</p>}
        </Card>
        <Card icon={Globe} title="Accès Internet (tunnel Cloudflare)" ok={h.tunnel.ok} testId="health-tunnel">
          <p>{h.tunnel.domain ? <code>https://{h.tunnel.domain}</code> : "API_DOMAIN non défini"}</p>
          {h.tunnel.ms != null && <p>Réponse en {h.tunnel.ms} ms depuis la VM via Internet</p>}
          {h.tunnel.ok === false && <p className="text-rose-700">Les élèves hors de l'école ne peuvent pas joindre l'API. Sur la VM : <code>docker compose logs tunnel</code></p>}
        </Card>
        <Card icon={HardDrive} title="Disque du serveur" ok={h.disk.used_pct < 90} warn={diskWarn && h.disk.used_pct < 90} testId="health-disk">
          <p>{h.disk.free_gb} Go libres sur {h.disk.total_gb} Go ({h.disk.used_pct} % utilisé)</p>
          <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${h.disk.used_pct >= 90 ? "bg-rose-500" : diskWarn ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${h.disk.used_pct}%` }} /></div>
          {diskWarn && <p className="text-amber-700">Nettoyer : <code>docker system prune -af</code></p>}
        </Card>
        <Card icon={Archive} title="Sauvegardes" ok={backupOk} warn={!h.db.atlas && bAge !== null && bAge >= 30 && bAge < 72} testId="health-backup">
          {h.backup.last_at ? <p>Dernière : {fmt(h.backup.last_at)} ({h.backup.size_mb} Mo) · {h.backup.count} archive(s) conservée(s)</p> : <p>Aucune archive dans <code>sauvegardes/</code></p>}
          {h.db.atlas && <p className="text-slate-500">Atlas conserve aussi ses propres sauvegardes.</p>}
          {!h.db.atlas && !backupOk && <p className="text-rose-700">{h.backup.last_at ? "Plus de 30 h sans sauvegarde" : "Aucune sauvegarde encore faite"} : vérifier <code>crontab -l</code> et lancer <code>./sauvegarde.sh</code></p>}
        </Card>
        <Card icon={Mail} title="Courriels (SMTP)" ok={h.mail} testId="health-mail">
          <p>{h.mail ? "Configurés : alertes d'aide, bienvenue et alertes serveur actives." : "Non configurés : aucune alerte par courriel ne peut partir."}</p>
        </Card>
        <Card icon={Server} title="Alertes automatiques" ok={h.mail} testId="health-alerts">
          <p>Le script <code>surveillance.sh</code> (cron, 10 min) envoie un courriel à l'admin si le tunnel ou l'API tombe, et <code>sauvegarde.sh</code> si la sauvegarde échoue.</p>
        </Card>
      </div>
    </div>
  );
};
