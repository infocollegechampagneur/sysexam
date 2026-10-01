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
    if (onPage({ src: c.toDataURL("image/jpeg", 0.85), ratio: vp.height / vp.width }) === false) return;
  }
}

export async function downloadAnnotatedPdf(blob, annotations, filename) {
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
  const bytes = await doc.save();
  const el = document.createElement("a");
  el.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  el.download = `${filename}.pdf`;
  el.click();
  URL.revokeObjectURL(el.href);
}
