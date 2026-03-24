const WORK_MODES = new Set(["remoto", "hibrido", "presencial", "indiferente"]);

export type OnboardingProfilePayload = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: number;
  skills: string;
  expected_salary: number;
  work_mode: string;
  cv_url?: string;
  /** Optional; stored in candidate_profiles.summary */
  summary?: string;
  /** Optional; stored in candidate_profiles.industries (text) */
  industries?: string;
};

/** Shared validation for onboarding-save and complete-pending-onboarding. */
export function validateOnboardingProfilePayload(
  body: Partial<OnboardingProfilePayload>,
): string | null {
  const full_name = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const whatsapp = String(body.whatsapp ?? "").trim();
  const city = String(body.city ?? "").trim();
  const target_role = String(body.target_role ?? "").trim();
  const skills = String(body.skills ?? "").trim();
  const work_mode = String(body.work_mode ?? "").trim();
  const years = Number(body.years_experience);
  const salary = Number(body.expected_salary);

  if (!full_name) return "Indica tu nombre.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Correo no válido.";
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length < 8) return "Indica un teléfono o WhatsApp válido.";
  if (!city) return "Indica tu ciudad o ubicación.";
  if (!target_role) return "Indica el rol que buscas.";
  if (!skills) return "Añade al menos una habilidad.";
  if (!Number.isFinite(years) || years < 0 || years > 60)
    return "Años de experiencia no válidos.";
  if (!Number.isFinite(salary) || salary <= 0) return "Indica una expectativa salarial.";
  if (!WORK_MODES.has(work_mode)) return "Selecciona modalidad de trabajo.";

  return null;
}
