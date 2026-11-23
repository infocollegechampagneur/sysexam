import { useEffect, useRef, useState } from "react";
import { Package, Upload, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatErr } from "@/lib/api";

const CHUNK = 4 * 1024 * 1024;
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");
const guessVersion = (name) => (name.match(/(\d+\.\d+\.\d+)/) || [])[1] || "";

export const DesktopReleaseCard = ({ onPublished }) => {
  const [info, setInfo] = useState(null);
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);
  const load = () => api.get("/admin/desktop/release").then((r) => setInfo(r.data)).catch((e) => toast.error(formatErr(e)));
  useEffect(() => { load(); }, []);

  const pick = (f) => { setFile(f || null); if (f) setVersion(guessVersion(f.name)); };
  const upload = async () => {
    if (!file) return toast.error("Choisissez le fichier .msi ou .exe");
    if (!/^\d+\.\d+\.\d+$/.test(version.trim())) return toast.error("Version au format 1.2.10");
    const id = crypto.randomUUID();
    const total = Math.ceil(file.size / CHUNK);
    setProgress(0);
    try {
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        await api.post(`/admin/desktop/upload/${id}/chunk?index=${i}`, blob, { headers: { "Content-Type": "application/octet-stream" }, timeout: 120000 });
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      await api.post(`/admin/desktop/upload/${id}/finish`, { filename: file.name, version: version.trim(), total_chunks: total, notes });
      toast.success(`Version ${version.trim()} publiée : les postes l'installeront automatiquement`);
      setFile(null); setNotes(""); if (fileRef.current) fileRef.current.value = "";
      await load(); onPublished?.();
    } catch (e) { toast.error(formatErr(e)); } finally { setProgress(null); }
  };
  const remove = async () => {
    if (!window.confirm("Retirer la version publiée ? Les postes resteront sur leur version actuelle.")) return;
    try { await api.delete("/admin/desktop/release"); toast.success("Version retirée"); load(); onPublished?.(); } catch (e) { toast.error(formatErr(e)); }
  };

  const rel = info?.release;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="desktop-release-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Package className="h-4 w-4 text-blue-900" />Application Windows — version distribuée aux postes</h3>
          {rel ? (
            <p className="mt-1 text-sm text-slate-600" data-testid="desktop-release-current">
              Version <strong className="font-mono">{rel.version}</strong> · {rel.filename} · {(rel.size / 1048576).toFixed(0)} Mo · publiée le {fmt(rel.uploaded_at)} par {rel.uploaded_by}
              {rel.notes && <span className="block text-slate-500">{rel.notes}</span>}
            </p>
          ) : <p className="mt-1 text-sm text-slate-500" data-testid="desktop-release-none">Aucune version publiée : les postes se mettent à jour depuis GitHub (Releases) si Internet le permet.</p>}
          {rel && info.devices > 0 && (
            <p className={`mt-1 flex items-center gap-1.5 text-xs ${info.outdated.length ? "text-amber-700" : "text-emerald-700"}`} data-testid="desktop-outdated">
              {info.outdated.length ? <><AlertTriangle className="h-3.5 w-3.5" />{info.outdated.length} poste(s) sur {info.devices} encore en version antérieure : {info.outdated.slice(0, 6).join(", ")}{info.outdated.length > 6 ? "…" : ""} (mise à jour au prochain démarrage ou à 7 h 15)</> : <><CheckCircle2 className="h-3.5 w-3.5" />Tous les postes vus sont à jour</>}
            </p>
          )}
        </div>
        {rel && <Button size="sm" variant="ghost" className="text-rose-700" onClick={remove} data-testid="desktop-release-delete-btn"><Trash2 className="mr-1.5 h-4 w-4" />Retirer</Button>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
        <Input ref={fileRef} type="file" accept=".msi,.exe" onChange={(e) => pick(e.target.files?.[0])} disabled={progress !== null} data-testid="desktop-release-file" />
        <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version 1.2.10" className="font-mono" disabled={progress !== null} data-testid="desktop-release-version" />
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (facultatif) : ce qui change" disabled={progress !== null} data-testid="desktop-release-notes" />
        <Button size="sm" className="bg-blue-900 hover:bg-blue-800" onClick={upload} disabled={progress !== null || !file} data-testid="desktop-release-upload-btn"><Upload className="mr-1.5 h-4 w-4" />{progress === null ? "Publier" : `${progress} %`}</Button>
      </div>
      {progress !== null && <div className="mt-2 h-2 rounded-full bg-slate-100" data-testid="desktop-release-progress"><div className="h-2 rounded-full bg-blue-900 transition-[width]" style={{ width: `${progress}%` }} /></div>}
      <p className="mt-2 text-xs text-slate-500">Téléversez le <code>.msi</code> produit par GitHub (Actions → Build application Windows). Les postes où la tâche planifiée « MonExamEnLigne - Mise à jour » est installée (une seule fois, par GPO) téléchargent et installent cette version <strong>silencieusement, sans code administrateur</strong>, au démarrage et à 7 h 15 — jamais pendant un examen.</p>
    </div>
  );
};
