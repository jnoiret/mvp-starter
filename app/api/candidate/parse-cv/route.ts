import { NextResponse } from "next/server";
import { requireCandidateLifecycleApi } from "@/lib/auth/apiRbac";
import mammoth from "mammoth";
import type { WorkMode } from "@/components/candidate/onboarding/types";
import { extractPdfTextWithSmartFallbacks } from "@/lib/cv/extractPdfWithFallbacks";
import {
  analyzeCvExtractedText,
  COPY_CV_NO_SELECTABLE_TEXT,
  COPY_CV_WEAK_EXTRACTION,
  countMeaningfulProfileSignals,
  type CvParseDiagnostics,
  type CvParseFeedback,
  type ProfileSignalFields,
} from "@/lib/cv/parseDiagnostics";
import {
  computeParseTier,
  describeCoreFieldsForClient,
  type ParseTier,
} from "@/lib/cv/parseTier";
import { normalizeParsedProfileData } from "@/lib/cv/normalizeParsedProfile";
import {
  extractStructuredProfileWithOpenAI,
  structuredProfileHasCoreData,
  type CvStructuredProfile,
} from "@/lib/cv/structuredOpenAiParse";

export const runtime = "nodejs";

type ParsedProfile = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  city: string;
  current_title: string;
  target_role: string;
  seniority:
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "director"
    | "executive"
    | "unknown"
    | "";
  years_experience: string;
  skills: string;
  tools: string;
  industries: string;
  /** Free-form role descriptors (e.g. product focus); not persisted to DB in save-profile yet. */
  specializations: string;
  languages: string;
  education: string;
  summary: string;
  expected_salary: string;
  work_mode: WorkMode | "";
};

type ParsedProfileResponse = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  target_role: string;
  seniority:
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "director"
    | "executive"
    | "unknown";
  years_experience: number;
  skills: string[];
  tools: string[];
  industries: string[];
  specializations: string[];
  languages: string[];
  education: string[];
  summary: string;
  confidence_notes: string[];
};

function emptyProfile(): ParsedProfile {
  return {
    full_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    location: "",
    city: "",
    current_title: "",
    target_role: "",
    seniority: "",
    years_experience: "",
    skills: "",
    tools: "",
    industries: "",
    specializations: "",
    languages: "",
    education: "",
    summary: "",
    expected_salary: "",
    work_mode: "",
  };
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferSeniorityFromYearsString(yearsStr: string): ParsedProfile["seniority"] {
  const years = Number(String(yearsStr).replace(/\D/g, ""));
  if (!Number.isFinite(years)) return "";
  if (years >= 15) return "director";
  if (years >= 10) return "lead";
  if (years >= 6) return "senior";
  if (years >= 3) return "mid";
  if (years >= 1) return "junior";
  return "";
}

function toParsedProfileResponse(data: ParsedProfile): ParsedProfileResponse {
  let seniority = data.seniority;
  if (
    seniority !== "junior" &&
    seniority !== "mid" &&
    seniority !== "senior" &&
    seniority !== "lead" &&
    seniority !== "director" &&
    seniority !== "executive"
  ) {
    seniority = inferSeniorityFromYearsString(data.years_experience) || "unknown";
  }
  if (
    seniority !== "junior" &&
    seniority !== "mid" &&
    seniority !== "senior" &&
    seniority !== "lead" &&
    seniority !== "director" &&
    seniority !== "executive"
  ) {
    seniority = "unknown";
  }

  const years = Number(data.years_experience);
  const yearsExperience = Number.isFinite(years)
    ? Math.max(0, Math.round(years))
    : 0;

  return {
    full_name: data.full_name,
    email: data.email,
    phone: data.phone || data.whatsapp,
    location: data.location || data.city,
    current_title: data.current_title,
    target_role: data.target_role,
    seniority,
    years_experience: yearsExperience,
    skills: splitCommaList(data.skills),
    tools: splitCommaList(data.tools),
    industries: splitCommaList(data.industries),
    specializations: splitCommaList(data.specializations),
    languages: splitCommaList(data.languages),
    education: splitCommaList(data.education),
    summary: data.summary,
    confidence_notes: [],
  };
}

function mergeStructuredIntoProfile(
  base: ParsedProfile,
  structured: CvStructuredProfile,
): ParsedProfile {
  const yearsStr =
    structured.years_experience > 0
      ? String(structured.years_experience)
      : base.years_experience;
  const skillsStr =
    structured.skills.length > 0 ? structured.skills.join(", ") : base.skills;
  const city = structured.city || base.city;
  const wa = structured.whatsapp || base.whatsapp;
  const salary = structured.expected_salary || base.expected_salary;

  return {
    ...base,
    full_name: structured.full_name || base.full_name,
    summary: structured.summary || base.summary,
    target_role: structured.target_role || base.target_role,
    current_title: structured.target_role || base.current_title,
    years_experience: yearsStr,
    skills: skillsStr,
    city,
    location: city || base.location,
    whatsapp: wa,
    phone: wa || base.phone,
    expected_salary: salary,
    seniority: base.seniority || inferSeniorityFromYearsString(yearsStr),
  };
}

function firstMatch(regex: RegExp, text: string, group = 1) {
  const match = text.match(regex);
  return match?.[group]?.trim() ?? "";
}

function inferEmail(text: string) {
  return firstMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, text, 0);
}

function inferWhatsapp(text: string) {
  const match = text.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g);
  if (!match?.length) return "";
  const best = match.find((item) => item.replace(/[^\d]/g, "").length >= 8) ?? "";
  return best.trim();
}

function inferWorkMode(text: string): WorkMode | "" {
  const lower = text.toLowerCase();
  if (/\bh[ií]brido\b/.test(lower)) return "hibrido";
  if (/\bremoto\b/.test(lower) || /\bhome office\b/.test(lower)) return "remoto";
  if (/\bpresencial\b/.test(lower)) return "presencial";
  if (/\bindiferente\b/.test(lower) || /\bflexible\b/.test(lower)) {
    return "indiferente";
  }
  return "";
}

function inferYearsExperience(text: string) {
  const direct = firstMatch(
    /(\d{1,2})\+?\s*(?:a[nñ]os?|years?|yrs?)\s+(?:de\s+)?experiencia/i,
    text
  );
  if (direct) return direct;

  return firstMatch(
    /experiencia\s*(?:total)?\s*[:\-]?\s*(\d{1,2})\s*(?:a[nñ]os?|years?|yrs?)/i,
    text
  );
}

function inferExpectedSalary(text: string) {
  const value = firstMatch(
    /(?:salario\s*(?:esperado|pretendido)?|pretensiones?\s+salariales?|expected\s+salary)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    text
  );
  return value.replace(/[^\d]/g, "");
}

function inferCity(text: string) {
  return firstMatch(
    /(?:ciudad|ubicaci[oó]n|location|residencia)\s*[:\-]\s*([^\n,;|]+)/i,
    text
  );
}

function inferTargetRole(text: string, lines: string[]) {
  const labeled = firstMatch(
    /(?:puesto|rol|cargo|position|title|objetivo\s+profesional)\s*[:\-]\s*([^\n|]+)/i,
    text
  );
  if (labeled) return labeled;

  const roleCandidates = lines
    .slice(0, 12)
    .filter((line) => line.length > 3 && line.length < 60)
    .filter(
      (line) =>
        !/@/.test(line) &&
        !/\d{7,}/.test(line) &&
        !/(curriculum|resume|cv|tel[eé]fono|email|correo)/i.test(line)
    );

  return roleCandidates[1] ?? "";
}

function inferFullName(lines: string[]) {
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    if (cleaned.length < 4 || cleaned.length > 70) continue;
    if (/@/.test(cleaned) || /\d/.test(cleaned)) continue;
    if (
      /(curriculum|resume|cv|perfil|contacto|email|correo|tel[eé]fono)/i.test(
        cleaned
      )
    ) {
      continue;
    }

    const words = cleaned.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;

    return cleaned;
  }

  return "";
}

function inferSkills(text: string) {
  const block = firstMatch(
    /(?:habilidades|skills|competencias|tecnolog[ií]as)\s*[:\n-]\s*([\s\S]{0,250})/i,
    text
  );
  const source = block || firstMatch(/(?:stack|tools?)\s*[:\-]\s*([^\n]+)/i, text);
  if (!source) return "";

  const tokens = source
    .split(/[,|•·\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 30)
    .slice(0, 12);

  return tokens.join(", ");
}

function parseProfileFromText(text: string): ParsedProfile {
  const normalized = normalizeText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    full_name: inferFullName(lines),
    email: inferEmail(normalized),
    phone: inferWhatsapp(normalized),
    whatsapp: inferWhatsapp(normalized),
    location: inferCity(normalized),
    city: inferCity(normalized),
    current_title: inferTargetRole(normalized, lines),
    target_role: inferTargetRole(normalized, lines),
    seniority: "",
    years_experience: inferYearsExperience(normalized),
    skills: inferSkills(normalized),
    tools: "",
    industries: "",
    specializations: "",
    languages: "",
    education: "",
    summary: "",
    expected_salary: inferExpectedSalary(normalized),
    work_mode: inferWorkMode(normalized),
  };
}

const CV_PARSE_DIAG = "[CV_PARSE_DIAG]";

function buildDiagnostics(
  extractedText: string,
  isPdf: boolean,
  meaningfulFieldCount: number,
): CvParseDiagnostics {
  const q = analyzeCvExtractedText(extractedText, isPdf);
  return { ...q, meaningfulFieldCount };
}

async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

const PASTED_TEXT_MAX_CHARS = 200_000;

type ParseSourceMeta = {
  kind: "file" | "paste";
  fileName?: string;
  fileType?: string;
};

type TextExtractionMeta = {
  pdfjs_fallback_attempted: boolean;
  pdfjs_fallback_used: boolean;
  ocr_attempted: boolean;
  ocr_used: boolean;
};

const EMPTY_EXTRACTION_META: TextExtractionMeta = {
  pdfjs_fallback_attempted: false,
  pdfjs_fallback_used: false,
  ocr_attempted: false,
  ocr_used: false,
};

function toSignalFields(data: ParsedProfile): ProfileSignalFields {
  return {
    full_name: data.full_name,
    email: data.email,
    phone: data.phone,
    whatsapp: data.whatsapp,
    city: data.city,
    location: data.location,
    current_title: data.current_title,
    target_role: data.target_role,
    years_experience: data.years_experience,
    skills: data.skills,
    tools: data.tools,
    expected_salary: data.expected_salary,
    summary: data.summary,
  };
}

async function buildParseResponseFromExtractedText(
  extractedText: string,
  isPdf: boolean,
  meta: ParseSourceMeta,
  extractionMeta: TextExtractionMeta = EMPTY_EXTRACTION_META,
): Promise<NextResponse> {
  const extractedLength = extractedText.trim().length;
  const textQuality = analyzeCvExtractedText(extractedText, isPdf);

  const unusableText =
    extractedLength < 40 || (isPdf && textQuality.likelyScannedPdf);

  if (unusableText) {
    const diag = buildDiagnostics(extractedText, isPdf, 0);
    console.info(CV_PARSE_DIAG, {
      step: "parse_input_unusable",
      reason:
        extractedLength < 40 ? "very_low_text" : "likely_scanned_or_garbage_pdf",
      source: meta.kind,
      ...diag,
    });
    console.info("[cv-parse-debug] server: insufficient or low-quality text", {
      source: meta.kind,
      fileName: meta.fileName,
      fileType: meta.fileType,
      extractedLength,
      likelyScannedPdf: textQuality.likelyScannedPdf,
    });
    return NextResponse.json(
      {
        success: true,
        parsed_profile: toParsedProfileResponse(emptyProfile()),
        data: emptyProfile(),
        meta: {
          extracted_characters: extractedLength,
          scanned_pdf_fallback_attempted:
            extractionMeta.pdfjs_fallback_attempted || extractionMeta.ocr_attempted,
          scanned_pdf_fallback_used:
            extractionMeta.pdfjs_fallback_used || extractionMeta.ocr_used,
          pdfjs_fallback_attempted: extractionMeta.pdfjs_fallback_attempted,
          pdfjs_fallback_used: extractionMeta.pdfjs_fallback_used,
          ocr_attempted: extractionMeta.ocr_attempted,
          ocr_used: extractionMeta.ocr_used,
        },
        parse_feedback: "no_selectable_text" satisfies CvParseFeedback,
        parse_tier: "extraction_failed" satisfies ParseTier,
        core_field_analysis: describeCoreFieldsForClient(toSignalFields(emptyProfile())),
        diagnostics: diag,
        warning: COPY_CV_NO_SELECTABLE_TEXT,
      },
      { status: 200 },
    );
  }

  let data = parseProfileFromText(extractedText);
  const heuristicNonEmpty = Object.values(data).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
  console.info(CV_PARSE_DIAG, {
    step: "heuristics_complete",
    source: meta.kind,
    extractedLength,
    heuristicNonEmptyStringFields: heuristicNonEmpty,
  });

  let structured: CvStructuredProfile | null = null;
  let warning: string | null = null;

  try {
    structured = await extractStructuredProfileWithOpenAI(extractedText, {
      log: (step, payload) => console.info(CV_PARSE_DIAG, { step, ...payload }),
    });

    if (structured && structuredProfileHasCoreData(structured)) {
      data = mergeStructuredIntoProfile(data, structured);
      console.info(CV_PARSE_DIAG, {
        step: "server_structured_merged_into_profile",
        structuredPreview: {
          full_name: structured.full_name,
          target_role: structured.target_role,
          skillsCount: structured.skills.length,
          years: structured.years_experience,
        },
      });
    } else if (!process.env.OPENAI_API_KEY) {
      warning =
        "No pudimos completar todo automáticamente. Revisa y ajusta tus datos antes de continuar.";
    } else if (!structured) {
      warning =
        "No pudimos completar todo automáticamente. Revisa y ajusta tus datos antes de continuar.";
    }
  } catch (parseErr) {
    warning =
      "No pudimos completar todo automáticamente. Revisa y ajusta tus datos antes de continuar.";
    console.warn(CV_PARSE_DIAG, {
      step: "server_openai_merge_caught",
      message: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
  }

  data = normalizeParsedProfileData(data);

  const meaningfulFieldCount = countMeaningfulProfileSignals(data);
  let parse_feedback: CvParseFeedback =
    meaningfulFieldCount >= 3 ? "ok" : "weak_profile_data";

  if (meaningfulFieldCount >= 3) {
    warning = null;
  } else {
    warning = COPY_CV_WEAK_EXTRACTION;
  }

  const diagnostics = buildDiagnostics(
    extractedText,
    isPdf,
    meaningfulFieldCount,
  );

  const parsedProfile = toParsedProfileResponse(data);

  const parse_tier = computeParseTier({
    parse_feedback,
    meaningfulFieldCount,
    data: toSignalFields(data),
  });

  console.info(CV_PARSE_DIAG, {
    step: "server_response_ready",
    source: meta.kind,
    extractedCharacters: extractedLength,
    structuredOpenAiMerged: Boolean(structured && structuredProfileHasCoreData(structured)),
    parse_feedback,
    ...diagnostics,
  });

  console.info("[cv-parse-debug] server: parse result", {
    source: meta.kind,
    fileName: meta.fileName,
    fileType: meta.fileType,
    extractedCharacters: extractedLength,
    structuredParseUsed: Boolean(structured && structuredProfileHasCoreData(structured)),
    parse_feedback,
    diagnostics,
    warning,
    dataSnapshot: {
      full_name: data.full_name,
      summary: data.summary?.slice(0, 80),
      target_role: data.target_role,
      current_title: data.current_title,
      years_experience: data.years_experience,
      skills: data.skills?.slice(0, 120),
      city: data.city,
      location: data.location,
      whatsapp: data.whatsapp,
      phone: data.phone,
      expected_salary: data.expected_salary,
    },
    parsedProfileSnapshot: {
      full_name: parsedProfile.full_name,
      years_experience: parsedProfile.years_experience,
      skillsCount: parsedProfile.skills?.length,
      target_role: parsedProfile.target_role,
    },
  });

  return NextResponse.json(
    {
      success: true,
      parsed_profile: parsedProfile,
      data,
      meta: {
        extracted_characters: extractedLength,
        scanned_pdf_fallback_attempted:
          extractionMeta.pdfjs_fallback_attempted || extractionMeta.ocr_attempted,
        scanned_pdf_fallback_used:
          extractionMeta.pdfjs_fallback_used || extractionMeta.ocr_used,
        pdfjs_fallback_attempted: extractionMeta.pdfjs_fallback_attempted,
        pdfjs_fallback_used: extractionMeta.pdfjs_fallback_used,
        ocr_attempted: extractionMeta.ocr_attempted,
        ocr_used: extractionMeta.ocr_used,
      },
      parse_feedback,
      parse_tier,
      core_field_analysis: describeCoreFieldsForClient(toSignalFields(data)),
      diagnostics,
      warning,
      scanned_pdf_fallback_attempted:
        extractionMeta.pdfjs_fallback_attempted || extractionMeta.ocr_attempted,
      scanned_pdf_fallback_used:
        extractionMeta.pdfjs_fallback_used || extractionMeta.ocr_used,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  try {
    const lifecycleGate = await requireCandidateLifecycleApi();
    if (lifecycleGate instanceof NextResponse) return lifecycleGate;

    const formData = await request.formData();
    const file = formData.get("cv");
    const pastedRaw = formData.get("pasted_text");
    const pastedText =
      typeof pastedRaw === "string" ? normalizeText(pastedRaw) : "";

    const hasFile = file instanceof File && file.size > 0;

    if (!hasFile && !pastedText) {
      console.warn(CV_PARSE_DIAG, {
        step: "server_no_input",
        formFieldKeys: [...formData.keys()],
      });
      return NextResponse.json(
        {
          error:
            "Envía un archivo PDF o DOCX, o pega el texto de tu CV en el campo indicado.",
        },
        { status: 400 },
      );
    }

    if (hasFile && !(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió un archivo de CV válido." },
        { status: 400 },
      );
    }

    if (!hasFile && pastedText.length > PASTED_TEXT_MAX_CHARS) {
      return NextResponse.json(
        {
          error: `El texto pegado supera el límite de ${PASTED_TEXT_MAX_CHARS.toLocaleString("es-ES")} caracteres.`,
        },
        { status: 400 },
      );
    }

    if (!hasFile) {
      console.info(CV_PARSE_DIAG, {
        step: "server_pasted_text_received",
        charLength: pastedText.length,
      });
      return buildParseResponseFromExtractedText(pastedText, false, {
        kind: "paste",
      });
    }

    const cvFile = file as File;

    console.info(CV_PARSE_DIAG, {
      step: "server_file_received",
      fileName: cvFile.name,
      fileType: cvFile.type,
      fileSize: cvFile.size,
      fieldName: "cv",
    });

    const lowerName = cvFile.name.toLowerCase();
    const isPdf = cvFile.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      cvFile.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");

    if (!isPdf && !isDocx) {
      return NextResponse.json(
        { error: "Formato no compatible. Usa un archivo PDF o DOCX." },
        { status: 400 },
      );
    }

    const maxBytes = 5 * 1024 * 1024;
    if (cvFile.size > maxBytes) {
      return NextResponse.json(
        { error: "El archivo supera el tamaño máximo de 5 MB." },
        { status: 400 },
      );
    }

    const arrayBuffer = await cvFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    try {
      extractedText = isPdf ? "" : await extractTextFromDocxBuffer(buffer);
    } catch (parseError) {
      const reason =
        parseError instanceof Error
          ? `${parseError.name}: ${parseError.message}`
          : String(parseError);

      console.info("[cv-parse-debug] server: extract failed", {
        fileName: cvFile.name,
        fileType: cvFile.type,
        reason,
      });

      const diag = buildDiagnostics("", isPdf, 0);
      console.info(CV_PARSE_DIAG, {
        step: "parse_input_unusable",
        reason: "extract_threw",
        ...diag,
      });
      return NextResponse.json(
        {
          success: true,
          parsed_profile: toParsedProfileResponse(emptyProfile()),
          data: emptyProfile(),
          meta: {
            extracted_characters: 0,
            scanned_pdf_fallback_attempted: false,
            scanned_pdf_fallback_used: false,
            pdfjs_fallback_attempted: false,
            pdfjs_fallback_used: false,
            ocr_attempted: false,
            ocr_used: false,
          },
          parse_feedback: "no_selectable_text" satisfies CvParseFeedback,
          parse_tier: "extraction_failed" satisfies ParseTier,
          core_field_analysis: describeCoreFieldsForClient(toSignalFields(emptyProfile())),
          diagnostics: diag,
          warning: COPY_CV_NO_SELECTABLE_TEXT,
          reason,
        },
        { status: 200 },
      );
    }

    let extractionMeta: TextExtractionMeta = EMPTY_EXTRACTION_META;
    if (isPdf) {
      const r = await extractPdfTextWithSmartFallbacks(buffer);
      extractedText = r.text;
      extractionMeta = r.meta;
    }

    return buildParseResponseFromExtractedText(
      extractedText,
      isPdf,
      {
        kind: "file",
        fileName: cvFile.name,
        fileType: cvFile.type,
      },
      extractionMeta,
    );
  } catch (error) {
    console.error("CV parse route error:", error);
    const reason =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(CV_PARSE_DIAG, {
      step: "server_unhandled_error",
      reason,
    });

    return NextResponse.json(
      { error: "No pudimos procesar el CV en este momento.", reason },
      { status: 500 }
    );
  }
}