import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Type, X, GripVertical, Highlighter, Underline as UnderlineIcon } from "lucide-react";
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

const Mark = ({ a, idx, readOnly, passive, onDelete }) => (
  <div className={`group absolute ${passive ? "pointer-events-none" : ""}`} data-testid={`mark-${a.kind}-${idx}`}
    style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}>
    {a.kind === "highlight"
      ? <div className="h-full w-full rounded-[2px] bg-yellow-300/50 mix-blend-multiply" />
      : <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-600" />}
    {!readOnly && (
      <button type="button" onClick={onDelete} aria-label="Retirer la marque" data-testid={`mark-delete-${idx}`}
        className="absolute -right-2 -top-2 hidden rounded-full bg-rose-600 p-0.5 text-white group-hover:block">
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
);

export const PdfAnnotator = ({ fetchBlob, annotations, onChange, readOnly = false }) => {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState(null);
  const [draft, setDraft] = useState(null);
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
    if (mode !== "text" || readOnly) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange([...annotations, { id: uid(), page, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: 0.42, fs: 0.018, text: "" }]);
    setMode(null);
  };

  const startMark = (e, page) => {
    if (readOnly || (mode !== "highlight" && mode !== "underline")) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const kind = mode;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const sx = clamp((e.clientX - r.left) / r.width), sy = clamp((e.clientY - r.top) / r.height);
    const calc = (ev) => {
      const x = clamp((ev.clientX - r.left) / r.width), y = clamp((ev.clientY - r.top) / r.height);
      return { page, kind, x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
    };
    const move = (ev) => setDraft(calc(ev));
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const m = calc(ev);
      setDraft(null);
      if (m.w > 0.005) onChange([...annRef.current, { id: uid(), ...m, h: Math.max(m.h, 0.012) }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const texts = annotations.filter((a) => !a.kind || a.kind === "text");
  const marks = annotations.length - texts.length;
  const ModeBtn = ({ m, icon: Icon, label, testId }) => (
    <Button size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode((v) => (v === m ? null : m))}
      className={mode === m ? "bg-amber-500 text-white hover:bg-amber-600" : ""} data-testid={testId}>
      <Icon className="mr-1.5 h-4 w-4" />{label}
    </Button>
  );

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
          <ModeBtn m="text" icon={Type} label={mode === "text" ? "Cliquez dans le document…" : "Zone de texte"} testId="annotator-add-text-btn" />
          <ModeBtn m="highlight" icon={Highlighter} label="Surligner" testId="annotator-highlight-btn" />
          <ModeBtn m="underline" icon={UnderlineIcon} label="Souligner" testId="annotator-underline-btn" />
          <span className="text-xs text-slate-500" data-testid="annotator-counts">
            {texts.length} zone(s) de texte · {marks} marque(s) · {mode === "highlight" || mode === "underline" ? "glissez sur le passage" : "survolez une marque pour la retirer"}
          </span>
        </div>
      )}
      <div ref={wrap} className="mx-auto max-w-[900px] space-y-4 p-4">
        {error && <p className="text-sm text-rose-700">Impossible de charger le PDF.</p>}
        {!pages.length && !error && <div className="grid place-items-center p-10"><Loader2 className="h-5 w-5 animate-spin text-blue-900" /></div>}
        {pages.map((p, i) => (
          <div key={i} data-page={i} onClick={(e) => e.target === e.currentTarget || e.target.tagName === "IMG" ? addAt(e, i) : null}
            onPointerDown={(e) => startMark(e, i)}
            className={`relative bg-white shadow ${mode ? "cursor-crosshair" : ""}`} style={{ aspectRatio: `1 / ${p.ratio}`, touchAction: mode && mode !== "text" ? "none" : "auto" }} data-testid={`pdf-page-${i}`}>
            <img src={p.src} alt={`Page ${i + 1}`} draggable={false} className="pointer-events-auto block w-full select-none" />
            {annotations.map((a, k) => a.page === i && a.kind && a.kind !== "text" && (
              <Mark key={a.id} a={a} idx={k} readOnly={readOnly} passive={!!mode} onDelete={() => onChange(annotations.filter((o) => o.id !== a.id))} />
            ))}
            {draft?.page === i && <Mark a={draft} idx="draft" readOnly passive />}
            {annotations.map((a, k) => a.page === i && (!a.kind || a.kind === "text") && (
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
