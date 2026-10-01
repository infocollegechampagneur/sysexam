import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Type, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderPdfPages } from "@/lib/pdf";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const AnnotationBox = ({ a, pageW, readOnly, onChange, onDelete, onDragStart, idx }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${ref.current.scrollHeight}px`; }
  }, [a.text, pageW]);
  const style = { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, fontSize: `${a.fs * pageW}px`, lineHeight: 1.3 };
  if (readOnly)
    return <div className="absolute whitespace-pre-wrap break-words px-[3px] py-[2px] text-blue-800" style={style} data-testid={`annotation-view-${idx}`}>{a.text}</div>;
  return (
    <div className="group absolute" style={style}>
      <div className="absolute -left-5 top-0 flex flex-col opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" onPointerDown={onDragStart} className="cursor-move rounded bg-blue-900 p-0.5 text-white" aria-label="Déplacer" data-testid={`annotation-drag-${idx}`}><GripVertical className="h-3 w-3" /></button>
        <button type="button" onClick={onDelete} className="mt-0.5 rounded bg-rose-600 p-0.5 text-white" aria-label="Supprimer" data-testid={`annotation-delete-${idx}`}><X className="h-3 w-3" /></button>
      </div>
      <textarea ref={ref} autoFocus={!a.text} value={a.text} rows={1} onChange={(e) => onChange({ ...a, text: e.target.value })}
        spellCheck={false} placeholder="Écrivez ici…" data-testid={`annotation-input-${idx}`}
        className="block w-full resize-none overflow-hidden rounded-sm border border-dashed border-blue-400 bg-blue-50/40 px-[3px] py-[2px] text-blue-800 outline-none focus:border-blue-700 focus:bg-white/80"
        style={{ fontSize: "inherit", lineHeight: "inherit" }} />
    </div>
  );
};

export const PdfAnnotator = ({ fetchBlob, annotations, onChange, readOnly = false }) => {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [width, setWidth] = useState(800);
  const wrap = useRef(null);
  const annRef = useRef(annotations);
  annRef.current = annotations;

  useEffect(() => {
    let cancel = false;
    const out = [];
    fetchBlob().then((b) => renderPdfPages(b, (p) => { if (cancel) return false; out.push(p); setPages([...out]); })).catch(() => setError(true));
    return () => { cancel = true; };
  }, [fetchBlob]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const addAt = (e, page) => {
    if (!adding || readOnly) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange([...annotations, { id: uid(), page, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: 0.42, fs: 0.018, text: "" }]);
    setAdding(false);
  };

  const drag = (e, a) => {
    e.preventDefault();
    const pageEl = e.currentTarget.closest("[data-page]");
    const r = pageEl.getBoundingClientRect();
    const move = (ev) => {
      const x = Math.min(0.95, Math.max(0, (ev.clientX - r.left) / r.width));
      const y = Math.min(0.98, Math.max(0, (ev.clientY - r.top) / r.height));
      onChange(annRef.current.map((o) => (o.id === a.id ? { ...o, x, y } : o)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100" data-testid="pdf-annotator">
      {!readOnly && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <Button size="sm" onClick={() => setAdding((v) => !v)} className={adding ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-900 hover:bg-blue-800"} data-testid="annotator-add-text-btn">
            <Type className="mr-1.5 h-4 w-4" />{adding ? "Cliquez dans le document…" : "Ajouter une zone de texte"}
          </Button>
          <span className="text-xs text-slate-500">{annotations.length} zone(s) de texte · glissez la poignée bleue pour déplacer</span>
        </div>
      )}
      <div ref={wrap} className="mx-auto max-w-[900px] space-y-4 p-4">
        {error && <p className="text-sm text-rose-700">Impossible de charger le PDF.</p>}
        {!pages.length && !error && <div className="grid place-items-center p-10"><Loader2 className="h-5 w-5 animate-spin text-blue-900" /></div>}
        {pages.map((p, i) => (
          <div key={i} data-page={i} onClick={(e) => e.target === e.currentTarget || e.target.tagName === "IMG" ? addAt(e, i) : null}
            className={`relative bg-white shadow ${adding ? "cursor-crosshair" : ""}`} style={{ aspectRatio: `1 / ${p.ratio}` }} data-testid={`pdf-page-${i}`}>
            <img src={p.src} alt={`Page ${i + 1}`} draggable={false} className="pointer-events-auto block w-full select-none" />
            {annotations.map((a, k) => a.page === i && (
              <AnnotationBox key={a.id} a={a} idx={k} pageW={width - 32} readOnly={readOnly}
                onChange={(na) => onChange(annotations.map((o) => (o.id === a.id ? na : o)))}
                onDelete={() => onChange(annotations.filter((o) => o.id !== a.id))}
                onDragStart={(e) => drag(e, a)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
