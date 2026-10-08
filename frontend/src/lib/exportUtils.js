import html2pdf from "html2pdf.js";

const EXPORT_CSS = `
  .export-root, .export-root * { box-sizing: border-box; }
  .export-root p, .export-root li, .export-root h1, .export-root h2, .export-root h3, .export-root h4, .export-root tr, .export-root img, .export-root blockquote { page-break-inside: avoid; break-inside: avoid; }
  .export-root h1, .export-root h2, .export-root h3 { page-break-after: avoid; break-after: avoid; }
  .export-root table { page-break-inside: auto; }
  .export-root .doc-html p { orphans: 3; widows: 3; }
  .export-root [data-avoid-break] { page-break-inside: avoid; break-inside: avoid; }
`;

const withExportStyles = (fn) => {
  const style = document.createElement("style");
  style.textContent = EXPORT_CSS;
  document.head.appendChild(style);
  return Promise.resolve(fn()).finally(() => style.remove());
};

export const exportPdf = (element, filename) => withExportStyles(() =>
  html2pdf()
    .set({ margin: [14, 12, 16, 12], filename: `${filename}.pdf`, html2canvas: { scale: 2, useCORS: true, letterRendering: true }, jsPDF: { unit: "mm", format: "letter" }, pagebreak: { mode: ["css", "legacy"], avoid: ["p", "li", "h1", "h2", "h3", "tr", "img", "[data-avoid-break]"] } })
    .from(element)
    .save());

export const exportWord = (element, filename) => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${filename}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: 8.5in 11in; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  p, li, h1, h2, h3, tr, blockquote, [data-avoid-break] { page-break-inside: avoid; mso-pagination: widow-orphan lines-together; }
  h1, h2, h3 { page-break-after: avoid; mso-pagination: widow-orphan lines-together; keep-with-next: always; }
  .html2pdf__page-break { page-break-before: always; }
</style></head><body>${element.innerHTML.replace(/<div class="html2pdf__page-break"[^>]*><\/div>/g, '<br clear="all" style="page-break-before:always" />')}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const slug = (s) => (s || "copie").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
