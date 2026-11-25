import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

export { pdfjsLib };

export async function renderPdfPages(blob, onPage) {
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1.6 });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    let text = null;
    try {
      const content = await page.getTextContent();
      if (content.items.some((it) => it.str && it.str.trim())) text = { content, viewport: page.getViewport({ scale: 1 }) };
    } catch (e) { /* PDF sans texte exploitable */ }
    if (onPage({ src: c.toDataURL("image/jpeg", 0.85), ratio: vp.height / vp.width, text }) === false) return;
  }
}

// Couche de texte pdf.js (sélection précise, lecture WordQ/Lexibar). `scale` = largeur affichée / largeur du PDF à l'échelle 1.
export function mountTextLayer(container, text, scale) {
  container.innerHTML = "";
  container.style.setProperty("--scale-factor", String(scale));
  const items = readingOrder(text.content.items);
  const textDivs = [];
  const task = pdfjsLib.renderTextLayer({ textContentSource: { ...text.content, items }, container, viewport: text.viewport, textDivs });
  task.promise.then(() => textDivs.forEach((d, i) => { d.dataset.i = i; })).catch(() => {});
  container.__items = items;
  return task;
}

// Rectangle exact (normalisé 0–1) du mot n° i, de la fraction f0 à f1 de sa longueur, d'après la géométrie du PDF.
export function itemRect(text, container, i, f0 = 0, f1 = 1) {
  const it = container.__items?.[i];
  if (!it) return null;
  const vp = text.viewport;
  const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
  const fh = Math.hypot(tx[2], tx[3]) || 10;
  const w = (it.width || 0) * vp.scale;
  return { x: (tx[4] + w * f0) / vp.width, y: (tx[5] - fh * 0.85) / vp.height, w: (w * (f1 - f0)) / vp.width, h: (fh * 1.05) / vp.height };
}

// Les PDF stockent le texte dans un ordre arbitraire : on le remet en ordre de lecture (lignes de haut en bas, mots de gauche à droite)
// pour que glisser la souris sur plusieurs lignes sélectionne le passage visible, et non des fragments épars.
function readingOrder(items) {
  const horiz = [];
  const other = [];
  for (const it of items) {
    if (it.str === undefined) continue;
    const [a, b, c, d, x, y] = it.transform;
    const fh = Math.hypot(c, d) || Math.hypot(a, b) || 1;
    (Math.abs(b) < 0.01 && Math.abs(c) < 0.01 ? horiz : other).push({ it, x, y, fh });
  }
  horiz.sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const w of horiz) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - w.y) < Math.min(line.fh, w.fh) * 0.6) line.words.push(w);
    else lines.push({ y: w.y, fh: w.fh, words: [w] });
  }
  const out = [];
  for (const line of lines) {
    line.words.sort((p, q) => p.x - q.x);
    line.words.forEach((w, i) => out.push({ ...w.it, hasEOL: i === line.words.length - 1 }));
  }
  for (const w of other) out.push({ ...w.it, hasEOL: true });
  return out;
}

export async function annotatedPdfBytes(blob, annotations) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const safe = (t) => t.split("").map((ch) => { if (ch === "\n") return ch; try { font.encodeText(ch); return ch; } catch (e) { return "?"; } }).join("");
  for (const a of annotations) {
    const p = pages[a.page];
    if (!p) continue;
    const { width, height } = p.getSize();
    const by = height - (a.y + (a.h || 0)) * height;
    if (a.kind === "highlight") {
      const hex = (a.color || "#FDE047").replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      p.drawRectangle({ x: a.x * width, y: by, width: a.w * width, height: a.h * height, color: rgb(r, g, b), opacity: 0.5 });
      continue;
    }
    if (a.kind === "underline") { p.drawLine({ start: { x: a.x * width, y: by }, end: { x: (a.x + a.w) * width, y: by }, thickness: 1.5, color: rgb(0.86, 0.15, 0.15) }); continue; }
    if (!a.text?.trim()) continue;
    const size = a.fs * width;
    p.drawText(safe(a.text), { x: a.x * width + 3, y: height - a.y * height - size - 2, size, font, color: rgb(0.05, 0.2, 0.6), maxWidth: a.w * width - 6, lineHeight: size * 1.3 });
  }
  return doc.save();
}

const saveBlob = (blob, name) => {
  const el = document.createElement("a");
  el.href = URL.createObjectURL(blob);
  el.download = name;
  el.click();
  URL.revokeObjectURL(el.href);
};

export async function downloadAnnotatedPdf(blob, annotations, filename) {
  saveBlob(new Blob([await annotatedPdfBytes(blob, annotations)], { type: "application/pdf" }), `${filename}.pdf`);
}

export async function downloadAllAnnotatedMerged(blob, sessions, filename, examTitle) {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  const small = await out.embedFont(StandardFonts.Helvetica);
  const ascii = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  for (const s of sessions) {
    const sep = out.addPage([612, 792]);
    sep.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: rgb(0.12, 0.23, 0.54) });
    sep.drawText(ascii(s.student_name), { x: 48, y: 740, size: 26, font, color: rgb(1, 1, 1) });
    sep.drawText(ascii(`${s.student_number ? `Matricule ${s.student_number}  -  ` : ""}${examTitle}`), { x: 48, y: 714, size: 12, font: small, color: rgb(0.85, 0.9, 1) });
    sep.drawText(ascii(`Copie annotee  -  ${s.annotations?.length || 0} annotation(s)${s.grade?.score != null ? `  -  Note : ${s.grade.score} / ${s.grade.max_score}` : ""}`), { x: 48, y: 660, size: 12, font: small, color: rgb(0.3, 0.3, 0.3) });
    const src = await PDFDocument.load(await annotatedPdfBytes(blob, s.annotations || []));
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  saveBlob(new Blob([await out.save()], { type: "application/pdf" }), `${filename}.pdf`);
}

export async function downloadAllAnnotatedZip(blob, sessions, filename, slugFn) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const s of sessions) zip.file(`${slugFn(s.student_name)}${s.student_number ? `_${slugFn(s.student_number)}` : ""}_annote.pdf`, await annotatedPdfBytes(blob, s.annotations || []));
  saveBlob(await zip.generateAsync({ type: "blob" }), `${filename}.zip`);
}
