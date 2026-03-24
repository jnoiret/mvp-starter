/**
 * Shared CV text quality + profile richness metrics (server and client).
 */

/** User-facing copy for parse outcomes (Spanish). */
export const COPY_CV_NO_SELECTABLE_TEXT =
  "Este archivo parece no tener texto seleccionable. Intenta con un PDF exportado desde Word/Google Docs o con un archivo DOCX.";

export const COPY_CV_WEAK_EXTRACTION =
  "No pudimos extraer suficiente información de este CV. Puedes completarlo manualmente o intentar con otro archivo.";

export const COPY_CV_PARTIAL =
  "Completamos parte de tu perfil. Revisa y ajusta algunos campos.";

export type CvParseFeedback =
  | "ok"
  | "no_selectable_text"
  | "weak_profile_data";

export type CvParseDiagnostics = {
  extractedTextLength: number;
  wordCount: number;
  letterRatio: number;
  likelyScannedPdf: boolean;
  meaningfulFieldCount: number;
};

/** Heuristics for PDFs that extracted little real language (scanned, garbage, or layout-only). */
export function analyzeCvExtractedText(
  rawText: string,
  isPdf: boolean,
): Omit<CvParseDiagnostics, "meaningfulFieldCount"> {
  const trimmed = rawText.replace(/\r/g, "").trim();
  const extractedTextLength = trimmed.length;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = tokens.filter((w) => {
    const lettersOnly = w.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/g, "");
    return lettersOnly.length > 1;
  }).length;

  const nonSpace = trimmed.replace(/\s/g, "");
  const letters = (nonSpace.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/g) ?? []).length;
  const letterRatio = nonSpace.length > 0 ? letters / nonSpace.length : 0;

  let likelyScannedPdf = false;
  if (isPdf && extractedTextLength >= 40) {
    if (letterRatio < 0.28 && extractedTextLength < 700) likelyScannedPdf = true;
    if (wordCount < 12 && extractedTextLength < 500) likelyScannedPdf = true;
    if (wordCount < 18 && letterRatio < 0.34 && extractedTextLength < 900) {
      likelyScannedPdf = true;
    }
  }

  return {
    extractedTextLength,
    wordCount,
    letterRatio: Math.round(letterRatio * 1000) / 1000,
    likelyScannedPdf,
  };
}

export type ProfileSignalFields = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  city: string;
  location: string;
  current_title: string;
  target_role: string;
  years_experience: string;
  skills: string;
  tools: string;
  expected_salary: string;
  summary: string;
};

/** Counts filled profile signals (aligned with onboarding “meaningful” checks). */
export function countMeaningfulProfileSignals(p: ProfileSignalFields): number {
  let n = 0;
  if (p.full_name.trim().length > 2) n += 1;
  if (p.email.trim().includes("@")) n += 1;
  if ((p.summary ?? "").trim().length > 12) n += 1;
  const role = (p.target_role || p.current_title).trim();
  if (role.length > 2) n += 1;
  const y = Number(String(p.years_experience ?? "").replace(/\D/g, ""));
  if (Number.isFinite(y) && y > 0) n += 1;
  const skillsBlob = [p.skills, p.tools]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  if (skillsBlob.length > 2 && !/^[,.\s·\-]+$/u.test(skillsBlob)) n += 1;
  const loc = (p.city || p.location).trim();
  if (loc.length > 2) n += 1;
  const phoneDigits = (p.whatsapp || p.phone).replace(/\D/g, "");
  if (phoneDigits.length >= 8) n += 1;
  const sal = (p.expected_salary ?? "").replace(/\D/g, "");
  if (sal.length > 0 && Number(sal) > 1) n += 1;
  return n;
}
