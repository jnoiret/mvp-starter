export type WorkMode = "remoto" | "hibrido" | "presencial" | "indiferente";

export type CandidateOnboardingData = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  city: string;
  current_title: string;
  target_role: string;
  seniority: "junior" | "mid" | "senior" | "lead" | "director" | "executive" | "unknown" | "";
  years_experience: string; // keep as string for inputs/validation
  skills: string;
  tools: string;
  industries: string;
  languages: string;
  education: string;
  summary: string;
  expected_salary: string; // keep as string for inputs/validation
  work_mode: WorkMode | "";
  cv_file: File | null;
};

export const CANDIDATE_ONBOARDING_TOTAL_STEPS = 4;

