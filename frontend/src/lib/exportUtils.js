import html2pdf from "html2pdf.js";

export const exportPdf = (element, filename) =>
  html2pdf()
    .set({ margin: 12, filename: `${filename}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: "mm", format: "letter" } })
    .from(element)
    .save();

export const exportWord = (element, filename) => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${filename}</title></head><body style="font-family:Calibri,Arial">${element.innerHTML}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const slug = (s) => (s || "copie").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
