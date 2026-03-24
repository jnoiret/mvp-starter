/**
 * OCR fallback for scanned PDFs (first page only). Heavy.
 * Call only when `FICHUR_ENABLE_PDF_OCR` is enabled upstream.
 * Requires: tesseract.js, @napi-rs/canvas, pdfjs-dist.
 */

export async function extractFirstPagePdfOcrText(buffer: Buffer): Promise<string> {
  const [{ createCanvas }, pdfjs, { createWorker }] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist"),
    import("tesseract.js"),
  ]);

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  if (pdf.numPages < 1) {
    await pdf.cleanup?.();
    return "";
  }

  const page = await pdf.getPage(1);
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const w = Math.max(1, Math.ceil(viewport.width));
  const h = Math.max(1, Math.ceil(viewport.height));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  const renderTask = page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  } as unknown as Parameters<typeof page.render>[0]);
  await renderTask.promise;

  const png = canvas.toBuffer("image/png");
  await pdf.cleanup?.();

  const worker = await createWorker("spa+eng", 1, {
    logger: () => {
      /* quiet */
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(png);
    return (text ?? "").replace(/\r/g, "").trim();
  } finally {
    await worker.terminate();
  }
}
