import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Type, X, GripVertical, Highlighter, Underline as UnderlineIcon, MousePointer2, TextCursor, Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderPdfPages, mountTextLayer, itemRect } from "@/lib/pdf";

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

export const HL_COLORS = [
  { id: "yellow", hex: "#FDE047", label: "Jaune" },
  { id: "green", hex: "#86EFAC", label: "Vert" },
  { id: "blue", hex: "#93C5FD", label: "Bleu" },
  { id: "pink", hex: "#F9A8D4", label: "Rose" },
  { id: "orange", hex: "#FDBA74", label: "Orange" },
];

const Mark = ({ a, idx, readOnly, passive, onDelete }) => (
  <div className={`group absolute ${passive ? "pointer-events-none" : ""}`} data-testid={`mark-${a.kind}-${idx}`}
    style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}>
    {a.kind === "highlight"
      ? <div className="h-full w-full rounded-[2px] mix-blend-multiply" style={{ backgroundColor: a.color || HL_COLORS[0].hex, opacity: 0.6 }} />
      : <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-600" />}
    {!readOnly && (
      <button type="button" onClick={onDelete} aria-label="Retirer la marque" data-testid={`mark-delete-${idx}`}
        className="absolute -right-2 -top-2 hidden rounded-full bg-rose-600 p-0.5 text-white group-hover:block">
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
);

const TextLayer = ({ text, active }) => {
  const ref = useRef(null);
  const drag = useRef(null);
  const task = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !text) return;
    const render = () => { const w = el.clientWidth; if (w > 0) { task.current?.cancel(); task.current = mountTextLayer(el, text, w / text.viewport.width); } };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => { ro.disconnect(); task.current?.cancel(); };
  }, [text]);

  // Position de texte la plus proche d'un point : caret exact si la souris est sur un mot, sinon mot le plus proche (même ligne d'abord).
  const posAt = (x, y) => {
    const layer = ref.current;
    const cr = document.caretRangeFromPoint?.(x, y);
    if (cr && layer.contains(cr.startContainer) && cr.startContainer.nodeType === 3) return { node: cr.startContainer, offset: cr.startOffset };
    const spans = drag.current?.spans || [];
    let best = null;
    for (const s of spans) {
      const r = s.rect;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 1000 + dx;
      if (!best || d < best.d) best = { d, s, after: x > r.right || (dy > 0 && y > r.bottom) };
    }
    if (!best) return null;
    const node = best.s.el.firstChild;
    return node ? { node, offset: best.after ? node.length : 0 } : null;
  };
  const apply = (a, b) => {
    if (!a || !b) return;
    const sel = window.getSelection();
    const back = a.node === b.node ? a.offset > b.offset : !!(a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_PRECEDING);
    const [s, e] = back ? [b, a] : [a, b];
    const r = document.createRange();
    r.setStart(s.node, s.offset);
    r.setEnd(e.node, e.offset);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  const down = (e) => {
    if (!active || e.button !== 0 || e.detail > 1) return;
    e.preventDefault();
    const spans = [...ref.current.querySelectorAll("span")].filter((el) => el.firstChild).map((el) => ({ el, rect: el.getBoundingClientRect() }));
    drag.current = { spans, start: null };
    drag.current.start = posAt(e.clientX, e.clientY);
    if (drag.current.start) window.getSelection().setBaseAndExtent(drag.current.start.node, drag.current.start.offset, drag.current.start.node, drag.current.start.offset);
    ref.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drag.current?.start) return;
    drag.current.last = { x: e.clientX, y: e.clientY };
    if (!drag.current.raf) drag.current.raf = requestAnimationFrame(() => { const d = drag.current; if (d) { d.raf = 0; apply(d.start, posAt(d.last.x, d.last.y)); } });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.start && d.last) setTimeout(() => { drag.current = { spans: d.spans }; apply(d.start, posAt(d.last.x, d.last.y)); drag.current = null; }, 0);
  };
  return <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={`pdf-text-layer textLayer absolute inset-0 overflow-hidden ${active ? "is-active" : "pointer-events-none"}`} aria-label="Texte du document" data-testid="pdf-text-layer" />;
};

export const PdfAnnotator = ({ fetchBlob, annotations, onChange, readOnly = false, readAloud = true }) => {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState(null);
  const [draft, setDraft] = useState(null);
  const [hlColor, setHlColor] = useState(HL_COLORS[0].hex);
  const [width, setWidth] = useState(800);
  const [selText, setSelText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const wrap = useRef(null);
  const annRef = useRef(annotations);
  annRef.current = annotations;

  useEffect(() => {
    const onSel = () => { const s = window.getSelection(); setSelText(s && !s.isCollapsed && wrap.current?.contains(s.anchorNode) ? s.toString().trim() : ""); };
    document.addEventListener("selectionchange", onSel);
    return () => { document.removeEventListener("selectionchange", onSel); window.speechSynthesis?.cancel(); };
  }, []);

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(selText);
    u.lang = "fr-CA";
    u.voice = synth.getVoices().find((v) => /^fr/i.test(v.lang) && /CA|Canada/i.test(v.lang + v.name)) || synth.getVoices().find((v) => /^fr/i.test(v.lang)) || null;
    u.rate = 0.95;
    u.onend = u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

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
      return { page, kind, ...(kind === "highlight" ? { color: hlColor } : {}), x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
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
  const hasText = pages.some((p) => p.text);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  // Transforme la sélection de texte courante en marques (une par ligne) ; renvoie false s'il n'y a pas de sélection dans le PDF.
  const markSelection = (kind) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !wrap.current) return false;
    const range = sel.getRangeAt(0);
    if (!wrap.current.contains(range.commonAncestorContainer)) return false;
    const pageEls = [...wrap.current.querySelectorAll("[data-page]")];
    const lines = [];
    const push = (m) => {
      const prev = lines[lines.length - 1];
      if (prev && prev.page === m.page && Math.abs(prev.y - m.y) < m.h * 0.5) { const x2 = Math.max(prev.x + prev.w, m.x + m.w); prev.x = Math.min(prev.x, m.x); prev.w = x2 - prev.x; prev.h = Math.max(prev.h, m.h); }
      else lines.push(m);
    };
    pageEls.forEach((pageEl, pi) => {
      const layer = pageEl.querySelector(".pdf-text-layer");
      const text = pages[pi]?.text;
      if (layer && text) {
        for (const span of layer.querySelectorAll("span[data-i]")) {
          if (!span.firstChild || !range.intersectsNode(span)) continue;
          const len = span.firstChild.length || 1;
          const f0 = span.firstChild === range.startContainer ? range.startOffset / len : 0;
          const f1 = span.firstChild === range.endContainer ? range.endOffset / len : 1;
          if (f1 <= f0) continue;
          const r = itemRect(text, layer, Number(span.dataset.i), f0, f1);
          if (r && r.w > 0) push({ page: pi, ...r });
        }
        return;
      }
      const pr = pageEl.getBoundingClientRect();
      for (const rc of range.getClientRects()) {
        if (rc.width < 1 || rc.height < 1 || rc.top < pr.top - 1 || rc.bottom > pr.bottom + 1) continue;
        push({ page: pi, x: clamp((rc.left - pr.left) / pr.width), y: clamp((rc.top - pr.top) / pr.height), w: rc.width / pr.width, h: rc.height / pr.height });
      }
    });
    if (!lines.length) return false;
    onChange([...annRef.current, ...lines.map((m) => ({ id: uid(), kind, ...(kind === "highlight" ? { color: hlColor } : {}), ...m }))]);
    sel.removeAllRanges();
    return true;
  };
  const ModeBtn = ({ m, icon: Icon, label, testId }) => (
    <Button size="sm" variant={mode === m ? "default" : "outline"} onClick={() => { if ((m === "highlight" || m === "underline") && markSelection(m)) return; setMode((v) => (v === m ? null : m)); }}
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
    <div className="overflow-clip rounded-xl border border-slate-200 bg-slate-100" data-testid="pdf-annotator">
      {!readOnly && (
        <div className="sticky top-16 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur" data-testid="annotator-toolbar">
          {hasText && (
            <>
              <Button size="sm" variant={mode === null ? "default" : "outline"} onClick={() => setMode(null)} className={mode === null ? "bg-blue-900 text-white hover:bg-blue-800" : ""} title="Glissez la souris sur le texte pour le sélectionner" data-testid="annotator-select-btn">
                <TextCursor className="mr-1.5 h-4 w-4" />Sélectionner
              </Button>
              {readAloud && <Button size="sm" variant="outline" disabled={!selText && !speaking} onClick={speak} className={speaking ? "border-emerald-600 text-emerald-700" : ""} title={selText ? "Lire la sélection à voix haute" : "Sélectionnez d'abord du texte"} data-testid="annotator-read-btn">
                {speaking ? <Square className="mr-1.5 h-4 w-4" /> : <Volume2 className="mr-1.5 h-4 w-4" />}{speaking ? "Arrêter" : "Lire"}
              </Button>}
              <span className="h-5 w-px bg-slate-200" />
            </>
          )}
          <ModeBtn m="text" icon={Type} label={mode === "text" ? "Cliquez dans le document…" : "Zone de texte"} testId="annotator-add-text-btn" />
          <ModeBtn m="highlight" icon={Highlighter} label="Surligner" testId="annotator-highlight-btn" />
          <div className="flex items-center gap-1 rounded-full border border-slate-200 px-1.5 py-1" role="radiogroup" aria-label="Couleur du surligneur" data-testid="highlight-color-picker">
            {HL_COLORS.map((c) => (
              <button key={c.id} type="button" title={c.label} aria-label={c.label} aria-checked={hlColor === c.hex} role="radio"
                onClick={() => { setHlColor(c.hex); setMode("highlight"); }} data-testid={`highlight-color-${c.id}`}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${hlColor === c.hex ? "scale-110 border-slate-900" : "border-white"}`}
                style={{ backgroundColor: c.hex }} />
            ))}
          </div>
          <ModeBtn m="underline" icon={UnderlineIcon} label="Souligner" testId="annotator-underline-btn" />
          <span className="text-xs text-slate-500" data-testid="annotator-counts">
            {texts.length} zone(s) de texte · {marks} marque(s) · {mode === "highlight" || mode === "underline" ? "glissez sur le passage" : mode === "text" ? "cliquez où placer la zone" : hasText ? (selText ? `texte sélectionné : ${readAloud ? "Lire, " : ""}Surligner ou Souligner` : "glissez la souris sur le texte pour le sélectionner") : "survolez une marque pour la retirer"}
          </span>
          {pages.length > 0 && !hasText && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800" title="Ce PDF est une image (numérisation) : le texte ne peut pas être sélectionné ni lu à voix haute. Demandez à l'enseignant un PDF créé depuis Word." data-testid="pdf-no-text-badge"><MousePointer2 className="h-3 w-3" />Texte non sélectionnable (PDF numérisé)</span>}
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
            {p.text && <TextLayer text={p.text} active={!mode} />}
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
