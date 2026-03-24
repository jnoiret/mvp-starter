import type { CoreFieldAnalysis } from "@/lib/cv/coreProfileFieldState";
import {
  countMeaningfulProfileSignals,
  type CvParseDiagnostics,
  type CvParseFeedback,
} from "@/lib/cv/parseDiagnostics";
import type { ParseTier } from "@/lib/cv/parseTier";
import type { CandidateOnboardingData } from "./types";

type ParsedCandidateProfile = Omit<CandidateOnboardingData, "cv_file">;
type ParsedProfilePayload = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  target_role: string;
  seniority: "junior" | "mid" | "senior" | "lead" | "director" | "executive" | "unknown";
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
type ParseResponse = {
  data: ParsedCandidateProfile;
  parsed_profile: Partial<ParsedProfilePayload>;
  meta?: {
    extracted_characters?: number;
    scanned_pdf_fallback_attempted?: boolean;
    scanned_pdf_fallback_used?: boolean;
    pdfjs_fallback_attempted?: boolean;
    pdfjs_fallback_used?: boolean;
    ocr_attempted?: boolean;
    ocr_used?: boolean;
  };
  /** Server-side quality hint for honest UX. */
  parse_feedback?: CvParseFeedback;
  parse_tier?: ParseTier;
  core_field_analysis?: CoreFieldAnalysis[];
  diagnostics?: CvParseDiagnostics;
  raw_response: unknown;
  parsed_profile_empty: boolean;
  warning?: string;
  reason?: string;
};

const DEBUG_PREFIX = "[cv-parse-debug]";
const CV_PARSE_DIAG = "[CV_PARSE_DIAG]";

/**
 * Counts fields that look genuinely filled from the parser (before onboarding placeholders).
 * Used to decide honest empty vs partial vs success messaging.
 */
export function countMeaningfulParsedFields(parsed: ParsedCandidateProfile): number {
  return countMeaningfulProfileSignals(parsed);
}

function toNaturalCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/);
  const allUpperWords = tokens.filter((token) => /^[A-ZÁÉÍÓÚÑ0-9]+$/.test(token));
  const isMostlyAllCaps = allUpperWords.length >= Math.ceil(tokens.length * 0.7);
  if (!isMostlyAllCaps) return trimmed;

  return tokens
    .map((token) => {
      // Preserve short acronyms (e.g. UX, UI, SQL).
      if (/^[A-Z0-9]{2,4}$/.test(token)) return token;
      const lower = token.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function looksInvalidRole(rawRole: string) {
  const role = rawRole.trim();
  if (!role) return true;
  if (role.length < 3 || role.length > 80) return true;

  const tokens = role.split(/\s+/).filter(Boolean);
  const hasOnlyNameLikeTokens =
    tokens.length >= 2 &&
    tokens.every((token) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(token));
  if (hasOnlyNameLikeTokens) return true;

  const letters = (role.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/g) ?? []).length;
  const symbols = (role.match(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]/g) ?? []).length;
  if (letters === 0) return true;
  if (symbols > Math.max(3, Math.floor(role.length * 0.2))) return true;

  const upperRatio =
    role.length > 0 ? (role.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length / role.length : 0;
  if (upperRatio > 0.85 && tokens.length <= 2) return true;

  return false;
}

function inferSeniorityFromYears(yearsExperience: string) {
  const years = Number(yearsExperience);
  if (!Number.isFinite(years)) return "unknown";
  if (years >= 15) return "director";
  if (years >= 10) return "lead";
  if (years >= 6) return "senior";
  if (years >= 3) return "mid";
  if (years >= 1) return "junior";
  return "unknown";
}

async function fetchAndMapCvParse(
  formData: FormData,
  logContext: { mode: "file" | "paste"; file?: File; textLength?: number },
): Promise<ParseResponse> {
  if (logContext.mode === "file" && logContext.file) {
    console.info(DEBUG_PREFIX, "client: upload", {
      name: logContext.file.name,
      type: logContext.file.type,
      size: logContext.file.size,
    });
    console.info(CV_PARSE_DIAG, {
      step: "client_file_attached",
      formField: "cv",
      fileName: logContext.file.name,
      fileType: logContext.file.type,
      fileSize: logContext.file.size,
      endpoint: "/api/candidate/parse-cv",
    });
  } else {
    console.info(DEBUG_PREFIX, "client: pasted text", {
      length: logContext.textLength ?? 0,
    });
    console.info(CV_PARSE_DIAG, {
      step: "client_pasted_text_attached",
      formField: "pasted_text",
      charLength: logContext.textLength ?? 0,
      endpoint: "/api/candidate/parse-cv",
    });
  }

  const response = await fetch("/api/candidate/parse-cv", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as {
    success?: boolean;
    parsed_profile?: Partial<ParsedProfilePayload>;
    data?: Partial<ParsedCandidateProfile>;
    meta?: {
      extracted_characters?: number;
      scanned_pdf_fallback_attempted?: boolean;
      scanned_pdf_fallback_used?: boolean;
      pdfjs_fallback_attempted?: boolean;
      pdfjs_fallback_used?: boolean;
      ocr_attempted?: boolean;
      ocr_used?: boolean;
    };
    parse_feedback?: CvParseFeedback;
    parse_tier?: ParseTier;
    core_field_analysis?: CoreFieldAnalysis[];
    diagnostics?: CvParseDiagnostics;
    error?: string;
    warning?: string;
    reason?: string;
  };
  console.info(DEBUG_PREFIX, "client: raw API JSON", {
    status: response.status,
    success: payload.success,
    warning: payload.warning,
    reason: payload.reason,
    error: payload.error,
    meta: payload.meta,
    parsed_profile: payload.parsed_profile,
    data: payload.data,
  });

  console.info(CV_PARSE_DIAG, {
    step: "client_response_received",
    httpStatus: response.status,
    success: payload.success,
    apiError: payload.error ?? null,
    warning: payload.warning ?? null,
    reason: payload.reason ?? null,
    extractedChars: payload.meta?.extracted_characters ?? null,
    parse_feedback: payload.parse_feedback ?? null,
    diagnostics: payload.diagnostics ?? null,
  });

  if (!response.ok) {
    console.warn(CV_PARSE_DIAG, {
      step: "client_http_error_throws",
      httpStatus: response.status,
      error: payload.error,
      reason: payload.reason,
    });
    const base = payload.error ?? "No pudimos analizar tu CV en este momento.";
    throw new Error(base);
  }

  const parsedProfile = payload.parsed_profile ?? {};
  const parsedFallback = payload.data ?? {};
  const safeString = (value: unknown) => (typeof value === "string" ? value : "");
  const safeList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((i) => i.trim()).filter(Boolean)
      : [];
  const safeWorkMode = (value: unknown) =>
    value === "remoto" || value === "hibrido" || value === "presencial" || value === "indiferente"
      ? value
      : "";

  const profileYearsNum =
    typeof parsedProfile.years_experience === "number" && Number.isFinite(parsedProfile.years_experience)
      ? Math.max(0, Math.round(parsedProfile.years_experience))
      : NaN;
  const fallbackYearsRaw = safeString(parsedFallback.years_experience);
  const fallbackYearsNum = Number(fallbackYearsRaw.replace(/\D/g, ""));
  let mergedYearsExperience: string;
  if (profileYearsNum > 0) {
    mergedYearsExperience = String(profileYearsNum);
  } else if (Number.isFinite(fallbackYearsNum) && fallbackYearsNum > 0) {
    mergedYearsExperience = String(fallbackYearsNum);
  } else if (fallbackYearsRaw.trim()) {
    mergedYearsExperience = fallbackYearsRaw.trim();
  } else {
    mergedYearsExperience = "";
  }

  const mappedFromProfile: ParsedCandidateProfile = {
    full_name: safeString(parsedProfile.full_name) || safeString(parsedFallback.full_name),
    email: safeString(parsedProfile.email) || safeString(parsedFallback.email),
    phone: safeString(parsedProfile.phone) || safeString(parsedFallback.phone),
    whatsapp:
      safeString(parsedFallback.whatsapp) ||
      safeString(parsedFallback.phone) ||
      safeString(parsedProfile.phone),
    location: safeString(parsedProfile.location) || safeString(parsedFallback.location),
    city: safeString(parsedFallback.city) || safeString(parsedProfile.location),
    current_title:
      safeString(parsedProfile.current_title) || safeString(parsedFallback.current_title),
    target_role: safeString(parsedProfile.target_role) || safeString(parsedFallback.target_role),
    seniority:
      parsedProfile.seniority === "junior" ||
      parsedProfile.seniority === "mid" ||
      parsedProfile.seniority === "senior" ||
      parsedProfile.seniority === "lead" ||
      parsedProfile.seniority === "director" ||
      parsedProfile.seniority === "executive" ||
      parsedProfile.seniority === "unknown"
        ? parsedProfile.seniority
        : "",
    years_experience: mergedYearsExperience,
    skills:
      safeList(parsedProfile.skills).join(", ") || safeString(parsedFallback.skills),
    tools:
      safeList(parsedProfile.tools).join(", ") || safeString(parsedFallback.tools),
    industries:
      safeList(parsedProfile.industries).join(", ") || safeString(parsedFallback.industries),
    specializations:
      safeList(parsedProfile.specializations).join(", ") || safeString(parsedFallback.specializations),
    languages:
      safeList(parsedProfile.languages).join(", ") || safeString(parsedFallback.languages),
    education:
      safeList(parsedProfile.education).join(", ") || safeString(parsedFallback.education),
    summary: safeString(parsedProfile.summary) || safeString(parsedFallback.summary),
    expected_salary: safeString(parsedFallback.expected_salary),
    work_mode: safeWorkMode(parsedFallback.work_mode),
  };

  mappedFromProfile.full_name = toNaturalCase(mappedFromProfile.full_name);
  mappedFromProfile.current_title = toNaturalCase(mappedFromProfile.current_title);
  mappedFromProfile.target_role = toNaturalCase(mappedFromProfile.target_role);

  const roleInvalid = looksInvalidRole(mappedFromProfile.target_role);
  if (roleInvalid) {
    if (!looksInvalidRole(mappedFromProfile.current_title)) {
      mappedFromProfile.target_role = mappedFromProfile.current_title;
    } else {
      mappedFromProfile.target_role = "";
    }
  }

  if (!mappedFromProfile.seniority || mappedFromProfile.seniority === "unknown") {
    mappedFromProfile.seniority = inferSeniorityFromYears(mappedFromProfile.years_experience);
  }

  const meaningfulCount = countMeaningfulParsedFields(mappedFromProfile);
  const dataKeysPresent = Object.entries(parsedFallback).filter(
    ([k, v]) =>
      k !== "cv_file" &&
      typeof v === "string" &&
      String(v).trim().length > 0,
  ).length;
  console.info(CV_PARSE_DIAG, {
    step: "onboarding_mapped_state",
    mappedForOnboarding: mappedFromProfile,
    meaningfulFieldCount: meaningfulCount,
  });
  console.info(CV_PARSE_DIAG, {
    step: "client_mapping_complete",
    meaningfulFieldCount: meaningfulCount,
    nonEmptyDataStringFields: dataKeysPresent,
    diagnosis:
      meaningfulCount >= 3
        ? "mapping_ok_profile_usable"
        : meaningfulCount > 0
          ? "mapping_partial_sparse_data"
          : dataKeysPresent === 0
            ? "likely_parser_or_extraction_empty_check_server_logs"
            : "mapping_or_validation_stripped_fields_check_role_rules",
  });
  console.info(DEBUG_PREFIX, "client: mapped profile + counts", {
    mappedFromProfile,
    meaningfulFieldCount: meaningfulCount,
    parsed_profile_empty_flag: !(
      safeString(parsedProfile.full_name) ||
      safeString(parsedProfile.email) ||
      safeString(parsedProfile.phone) ||
      safeString(parsedProfile.location) ||
      safeString(parsedProfile.current_title) ||
      safeString(parsedProfile.target_role) ||
      safeList(parsedProfile.skills).length
    ),
  });

  const parsedProfileEmpty = !(
    safeString(parsedProfile.full_name) ||
    safeString(parsedProfile.email) ||
    safeString(parsedProfile.phone) ||
    safeString(parsedProfile.location) ||
    safeString(parsedProfile.current_title) ||
    safeString(parsedProfile.target_role) ||
    safeList(parsedProfile.skills).length
  );

  return {
    data: mappedFromProfile,
    parsed_profile: parsedProfile,
    meta: payload.meta,
    parse_feedback: payload.parse_feedback,
    parse_tier: payload.parse_tier,
    core_field_analysis: payload.core_field_analysis,
    diagnostics: payload.diagnostics,
    raw_response: payload,
    parsed_profile_empty: parsedProfileEmpty,
    warning: payload.warning,
    reason: payload.reason,
  };
}

/**
 * Client entry point for server-side CV parsing (uploaded file).
 */
export async function parseCandidateProfileFromCv(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("cv", file);
  return fetchAndMapCvParse(formData, { mode: "file", file });
}

/**
 * Same pipeline as file upload: heuristics + OpenAI structured parse on the server.
 */
export async function parseCandidateProfileFromPastedText(text: string): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("pasted_text", text);
  return fetchAndMapCvParse(formData, {
    mode: "paste",
    textLength: text.length,
  });
}

