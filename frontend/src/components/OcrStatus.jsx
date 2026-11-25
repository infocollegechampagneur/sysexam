import { useEffect } from "react";
import { ScanText, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, formatErr } from "@/lib/api";

const LABEL = {
  none: ["ok", CheckCircle2, "Ce PDF contient du texte : sélectionnable et lisible par WordQ / Lexibar."],
  done: ["ok", CheckCircle2, "PDF numérisé : le texte a été reconnu automatiquement (OCR). Il est maintenant sélectionnable et lisible par WordQ / Lexibar."],
  pending: ["wait", Loader2, "PDF numérisé : reconnaissance du texte en cours (OCR), 10 s à 2 min selon le nombre de pages…"],
  failed: ["warn", AlertTriangle, "La reconnaissance du texte a échoué : les élèves ne pourront pas sélectionner ni faire lire ce PDF."],
  unavailable: ["warn", AlertTriangle, "PDF numérisé (image) : la reconnaissance de texte n'est pas installée sur ce serveur. Exportez le PDF depuis Word pour qu'il soit lisible."],
};

export const OcrStatus = ({ examId, file, onFile }) => {
  const st = file?.kind === "pdf" ? file.ocr : null;
  useEffect(() => {
    if (st !== "pending") return;
    const iv = setInterval(() => api.get(`/exams/${examId}`).then((r) => { if (r.data.file?.ocr !== "pending") { onFile(r.data.file); if (r.data.file?.ocr === "done") toast.success("Texte du PDF reconnu : il est maintenant lisible par WordQ / Lexibar"); } }).catch(() => {}), 4000);
    return () => clearInterval(iv);
  }, [st, examId, onFile]);
  if (!st) return null;
  const [tone, Icon, text] = LABEL[st] || LABEL.none;
  const retry = async () => { try { await api.post(`/exams/${examId}/file/ocr`); onFile({ ...file, ocr: "pending" }); } catch (e) { toast.error(formatErr(e)); } };
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${tone === "ok" ? "bg-emerald-50 text-emerald-800" : tone === "wait" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`} data-testid={`ocr-status-${st}`}>
      <ScanText className="h-4 w-4 shrink-0" />
      <Icon className={`h-4 w-4 shrink-0 ${st === "pending" ? "animate-spin" : ""}`} />
      <span className="flex-1">{text}</span>
      {st === "failed" && <Button size="sm" variant="outline" onClick={retry} data-testid="ocr-retry-btn"><RefreshCw className="mr-1 h-3.5 w-3.5" />Réessayer</Button>}
    </div>
  );
};
