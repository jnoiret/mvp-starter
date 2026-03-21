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
  };
  raw_response: unknown;
  parsed_profile_empty: boolean;
  warning?: string;
  reason?: string;
};

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

/**
 * Client entry point for server-side CV parsing.
 */
export async function parseCandidateProfileFromCv(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("cv", file);

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
    };
    error?: string;
    warning?: string;
    reason?: string;
  };
  console.info("[onboarding/cvParser] raw /api/candidate/parse-cv response", {
    status: response.status,
    payload,
  });

  if (!response.ok) {
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

  const mappedFromProfile: ParsedCandidateProfile = {
    full_name: safeString(parsedProfile.full_name) || safeString(parsedFallback.full_name),
    email: safeString(parsedProfile.email) || safeString(parsedFallback.email),
    phone: safeString(parsedProfile.phone) || safeString(parsedFallback.phone),
    whatsapp: safeString(parsedFallback.whatsapp) || safeString(parsedProfile.phone),
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
    years_experience:
      typeof parsedProfile.years_experience === "number" && Number.isFinite(parsedProfile.years_experience)
        ? String(Math.max(0, Math.round(parsedProfile.years_experience)))
        : safeString(parsedFallback.years_experience),
    skills:
      safeList(parsedProfile.skills).join(", ") || safeString(parsedFallback.skills),
    tools:
      safeList(parsedProfile.tools).join(", ") || safeString(parsedFallback.tools),
    industries:
      safeList(parsedProfile.industries).join(", ") || safeString(parsedFallback.industries),
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

  console.info("[onboarding/cvParser] mapped parsed data", mappedFromProfile);

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
    raw_response: payload,
    parsed_profile_empty: parsedProfileEmpty,
    warning: payload.warning,
    reason: payload.reason,
  };
}

