import type { CandidateOnboardingData } from "./types";

type ParsedCandidateProfile = Omit<CandidateOnboardingData, "cv_file">;
type ParseResponse = {
  data: ParsedCandidateProfile;
  warning?: string;
  reason?: string;
};

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
    data?: Partial<ParsedCandidateProfile>;
    error?: string;
    warning?: string;
    reason?: string;
  };

  if (!response.ok) {
    const base = payload.error ?? "No pudimos procesar tu CV.";
    const detail = payload.reason ? ` Detalle: ${payload.reason}` : "";
    throw new Error(`${base}${detail}`);
  }

  const parsed = payload.data ?? {};

  return {
    data: {
      full_name: parsed.full_name ?? "",
      email: parsed.email ?? "",
      whatsapp: parsed.whatsapp ?? "",
      city: parsed.city ?? "",
      target_role: parsed.target_role ?? "",
      years_experience: parsed.years_experience ?? "",
      skills: parsed.skills ?? "",
      expected_salary: parsed.expected_salary ?? "",
      work_mode: parsed.work_mode ?? "",
    },
    warning: payload.warning,
    reason: payload.reason,
  };
}

