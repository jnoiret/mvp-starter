/**
 * Secondary PDF text extraction (pdf.js). Sometimes recovers text PdfReader misses.
 */

export async function extractPdfTextWithPdfJs(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const line = textContent.items
      .map((item) => {
        if (item && typeof item === "object" && "str" in item && typeof item.str === "string") {
          return item.str;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    if (line.trim()) parts.push(line);
  }

  await pdf.cleanup?.();
  return parts.join("\n").replace(/\r/g, "").trim();
}
