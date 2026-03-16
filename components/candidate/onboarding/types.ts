export type WorkMode = "remoto" | "hibrido" | "presencial" | "indiferente";

export type CandidateOnboardingData = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: string; // keep as string for inputs/validation
  skills: string;
  expected_salary: string; // keep as string for inputs/validation
  work_mode: WorkMode | "";
  cv_file: File | null;
};

export const CANDIDATE_ONBOARDING_TOTAL_STEPS = 4;

