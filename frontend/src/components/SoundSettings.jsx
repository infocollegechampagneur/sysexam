import { useRef, useState } from "react";
import { Volume2, Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, formatErr } from "@/lib/api";
import { playAlert } from "@/lib/alertSound";

export const SoundSettings = ({ scope = "me", status, onChange }) => {
  const input = useRef(null);
  const [busy, setBusy] = useState("");
  const base = scope === "admin" ? "/admin/alert-sound" : "/auth/me/alert-sound";
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Fichier trop volumineux (max 2 Mo)");
    const fd = new FormData(); fd.append("file", file);
    setBusy("up");
    try { const { data } = await api.post(base, fd, { headers: { "Content-Type": "multipart/form-data" } }); onChange(data); toast.success("Sonnerie enregistrée"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); if (input.current) input.current.value = ""; }
  };
  const remove = async () => {
    setBusy("rm");
    try { const { data } = await api.delete(base); onChange(data); toast.success("Sonnerie retirée"); } catch (e) { toast.error(formatErr(e)); } finally { setBusy(""); }
  };
  const custom = scope === "admin" ? status?.configured : status === "custom";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid={`sound-settings-${scope}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Volume2 className="h-4 w-4 text-blue-900" />{scope === "admin" ? "Sonnerie par défaut (tous les enseignants)" : "Sonnerie des alertes d'aide"}</p>
      <p className="mt-1 text-xs text-slate-600">{scope === "admin" ? "Jouée chez les enseignants qui n'ont pas téléversé leur propre sonnerie. Sans fichier : bip intégré." : "Jouée quand un élève demande de l'aide. Sans fichier : sonnerie par défaut de l'école, sinon bip intégré."} MP3, WAV ou OGG, max 2 Mo.</p>
      <p className="mt-2 text-xs font-medium text-slate-700" data-testid={`sound-status-${scope}`}>{custom ? `✓ Sonnerie personnalisée${status?.name ? ` : ${status.name}` : ""}` : "Sonnerie par défaut"}</p>
      <input ref={input} type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid={`sound-file-input-${scope}`} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => playAlert(true)} data-testid={`sound-play-${scope}`}><Volume2 className="mr-1 h-3.5 w-3.5" />Écouter</Button>
        <Button size="sm" onClick={() => input.current?.click()} disabled={!!busy} className="bg-blue-900 hover:bg-blue-800" data-testid={`sound-upload-${scope}`}>{busy === "up" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="mr-1 h-3.5 w-3.5" />Téléverser</>}</Button>
        {custom && <Button size="sm" variant="ghost" onClick={remove} disabled={!!busy} className="text-rose-700" data-testid={`sound-remove-${scope}`}>{busy === "rm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="mr-1 h-3.5 w-3.5" />Retirer</>}</Button>}
      </div>
    </div>
  );
};
