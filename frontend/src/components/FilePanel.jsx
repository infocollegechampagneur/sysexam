import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/DocumentViewer";
import { api, formatErr } from "@/lib/api";

export const FilePanel = ({ examId, file, ensureSaved, onFile }) => {
  const input = useRef(null);
  const [loading, setLoading] = useState(false);
  const fetchBlob = useCallback(() => api.get(`/exams/${examId}/file`, { responseType: "blob" }).then((r) => r.data), [examId]);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLoading(true);
    try {
      const id = await ensureSaved();
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post(`/exams/${id}/file`, fd);
      onFile(data);
      toast.success("Document téléversé");
    } catch (err) {
      toast.error(formatErr(err));
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    await api.delete(`/exams/${examId}/file`).catch(() => {});
    onFile(null);
  };

  return (
    <div className="space-y-4" data-testid="file-panel">
      <input ref={input} type="file" accept=".pdf,.docx" className="hidden" onChange={upload} data-testid="exam-file-input" />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-5">
        <Upload className="h-5 w-5 text-blue-900" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">{file ? "Remplacer le document" : "Téléverser un document PDF ou Word (.docx)"}</p>
          <p className="text-xs text-slate-500">Max 20 Mo. Le document sera affiché en lecture seule à l'élève.</p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={loading} className="bg-blue-900 hover:bg-blue-800" data-testid="upload-exam-file-btn">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Choisir un fichier"}
        </Button>
        {file && <Button variant="ghost" className="text-rose-600" onClick={remove} data-testid="remove-exam-file-btn"><Trash2 className="h-4 w-4" /></Button>}
      </div>
      {file && examId && <DocumentViewer file={file} fetchBlob={fetchBlob} height="55vh" />}
    </div>
  );
};
