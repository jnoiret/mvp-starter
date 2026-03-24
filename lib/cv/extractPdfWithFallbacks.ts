import { extractFirstPagePdfOcrText } from "@/lib/cv/extractPdfTextOcr";
import { extractPdfTextWithPdfJs } from "@/lib/cv/extractPdfTextPdfJs";
import { extractTextFromPdfBuffer } from "@/lib/cv/extractPdfPdfReader";
import { analyzeCvExtractedText } from "@/lib/cv/parseDiagnostics";

const CV_PARSE_DIAG = "[CV_PARSE_DIAG]";

export type PdfExtractionMeta = {
  pdfjs_fallback_attempted: boolean;
  pdfjs_fallback_used: boolean;
  ocr_attempted: boolean;
  ocr_used: boolean;
};

/**
 * 1) PdfReader text
 * 2) If weak/scanned heuristics: pdf.js text pass
 * 3) If still unusable: optional OCR (first page) when FICHUR_ENABLE_PDF_OCR=1
 */
export async function extractPdfTextWithSmartFallbacks(
  buffer: Buffer,
): Promise<{ text: string; meta: PdfExtractionMeta }> {
  const meta: PdfExtractionMeta = {
    pdfjs_fallback_attempted: false,
    pdfjs_fallback_used: false,
    ocr_attempted: false,
    ocr_used: false,
  };

  let text = "";
  try {
    text = await extractTextFromPdfBuffer(buffer);
  } catch {
    text = "";
  }

  const q1 = analyzeCvExtractedText(text, true);
  const short = text.trim().length < 80;

  if (short || q1.likelyScannedPdf) {
    meta.pdfjs_fallback_attempted = true;
    try {
      const alt = await extractPdfTextWithPdfJs(buffer);
      if (alt.trim().length > text.trim().length) {
        text = alt;
        meta.pdfjs_fallback_used = true;
      }
    } catch (e) {
      console.warn(CV_PARSE_DIAG, {
        step: "pdfjs_text_fallback_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const q2 = analyzeCvExtractedText(text, true);
  const stillUnusable = text.trim().length < 40 || q2.likelyScannedPdf;
  const ocrEnabled =
    process.env.FICHUR_ENABLE_PDF_OCR === "1" ||
    process.env.FICHUR_ENABLE_PDF_OCR === "true";

  if (stillUnusable && ocrEnabled) {
    meta.ocr_attempted = true;
    try {
      const ocrText = await extractFirstPagePdfOcrText(buffer);
      if (ocrText.trim().length >= 40) {
        text = ocrText;
        meta.ocr_used = true;
      }
    } catch (e) {
      console.warn(CV_PARSE_DIAG, {
        step: "pdf_ocr_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { text, meta };
}
