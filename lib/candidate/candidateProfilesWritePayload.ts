/**
 * Columns this app reads/writes on `public.candidate_profiles`.
 * Keep in sync with Supabase schema and client `.select(...)` lists.
 */
export const CANDIDATE_PROFILES_WRITABLE_KEYS = [
  "id",
  "full_name",
  "email",
  "whatsapp",
  "city",
  "target_role",
  "years_experience",
  "skills",
  "expected_salary",
  "work_mode",
  "cv_url",
  "summary",
  "industries",
] as const;

export type CandidateProfilesUpsertRow = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: number;
  skills: string;
  expected_salary: number;
  work_mode: string;
  cv_url: string;
  summary: string;
  industries: string;
};

export function buildCandidateProfilesUpsertRow(
  userId: string,
  row: Omit<CandidateProfilesUpsertRow, "id" | "cv_url" | "summary" | "industries"> & {
    cv_url?: string;
    summary?: string;
    industries?: string;
  },
): CandidateProfilesUpsertRow {
  return {
    id: userId,
    full_name: row.full_name,
    email: row.email,
    whatsapp: row.whatsapp,
    city: row.city,
    target_role: row.target_role,
    years_experience: row.years_experience,
    skills: row.skills,
    expected_salary: row.expected_salary,
    work_mode: row.work_mode,
    cv_url: row.cv_url || "",
    summary: row.summary ?? "",
    industries: row.industries ?? "",
  };
}
