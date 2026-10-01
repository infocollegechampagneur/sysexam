import { useEffect, useState } from "react";
import { Loader2, FileText } from "lucide-react";

export const DocumentViewer = ({ file, fetchBlob, height = "70vh" }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!file || file.kind !== "pdf") return;
    let objectUrl;
    fetchBlob()
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => setError(true));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [file, fetchBlob]);

  if (!file) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="document-viewer">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
        <FileText className="h-4 w-4 text-blue-900" />
        <span className="truncate font-medium" data-testid="document-viewer-filename">{file.filename}</span>
      </div>
      {file.kind === "pdf" ? (
        error ? (
          <p className="p-6 text-sm text-rose-700">Impossible de charger le document.</p>
        ) : url ? (
          <iframe title="Document d'examen" src={`${url}#toolbar=0&navpanes=0`} className="w-full" style={{ height }} data-testid="document-pdf-frame" />
        ) : (
          <div className="grid place-items-center p-10"><Loader2 className="h-5 w-5 animate-spin text-blue-900" /></div>
        )
      ) : (
        <div className="doc-html select-none overflow-y-auto p-6" style={{ maxHeight: height }} data-testid="document-docx-html"
          dangerouslySetInnerHTML={{ __html: file.html || "<p>Document vide.</p>" }} />
      )}
    </div>
  );
};
