/**
 * Per-field completion for AI-first onboarding (rules only).
 * Focus: target_role, summary, skills, years_experience.
 */

export type CoreFieldKey = "target_role" | "summary" | "skills" | "years_experience";

export type CoreFieldState = "complete" | "partial" | "missing";

export type CoreFieldAnalysis = {
  key: CoreFieldKey;
  state: CoreFieldState;
  guidance: string;
};

const PLACEHOLDER_SKILLS = new Set(
  ["por completar en tu perfil", "por completar en tu perfil."].map((s) => s.toLowerCase()),
);

function trim(s: string | null | undefined) {
  return (s ?? "").trim();
}

export function countDistinctSkills(skills: string | null | undefined): number {
  const s = trim(skills);
  if (!s) return 0;
  if (PLACEHOLDER_SKILLS.has(s.toLowerCase())) return 0;
  return s
    .split(/[,;/|]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .length;
}

function parseYearsValue(years: string | null | undefined): number | null {
  const raw = trim(years);
  if (!raw) return null;
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Analyze the four core fields from flat profile strings (post-normalize).
 */
export function analyzeCoreProfileFields(input: {
  target_role?: string | null;
  current_title?: string | null;
  summary?: string | null;
  skills?: string | null;
  tools?: string | null;
  years_experience?: string | null;
}): CoreFieldAnalysis[] {
  const roleSource = trim(input.target_role) || trim(input.current_title);
  const roleLower = roleSource.toLowerCase();

  let targetState: CoreFieldState;
  let targetGuidance: string;
  if (!roleSource || roleLower === "por definir" || roleSource.length < 3) {
    targetState = "missing";
    targetGuidance = "Falta definir tu rol objetivo.";
  } else if (roleSource.length < 8 || roleSource.split(/\s+/).length < 2) {
    targetState = "partial";
    targetGuidance = "Define mejor tu rol objetivo (ej. Product Designer senior).";
  } else {
    targetState = "complete";
    targetGuidance = "";
  }

  const summary = trim(input.summary);
  let summaryState: CoreFieldState;
  let summaryGuidance: string;
  if (summary.length < 20) {
    summaryState = "missing";
    summaryGuidance = "Completa tu resumen profesional.";
  } else if (summary.length < 80) {
    summaryState = "partial";
    summaryGuidance = "Amplía tu resumen con logros o contexto (2–4 frases).";
  } else {
    summaryState = "complete";
    summaryGuidance = "";
  }

  const skillsCombined = [input.skills, input.tools]
    .map((x) => trim(x))
    .filter(Boolean)
    .join(", ");
  const nSkills = countDistinctSkills(skillsCombined);
  let skillsState: CoreFieldState;
  let skillsGuidance: string;
  if (nSkills < 2) {
    skillsState = "missing";
    skillsGuidance = "Agrega más habilidades relevantes (separadas por coma).";
  } else if (nSkills < 4) {
    skillsState = "partial";
    skillsGuidance = "Añade algunas habilidades más para reflejar tu stack completo.";
  } else {
    skillsState = "complete";
    skillsGuidance = "";
  }

  const years = parseYearsValue(input.years_experience);
  let yearsState: CoreFieldState;
  let yearsGuidance: string;
  if (years === null) {
    yearsState = "missing";
    yearsGuidance = "Indica tus años de experiencia.";
  } else if (years <= 0) {
    yearsState = "partial";
    yearsGuidance = "Confirma tus años de experiencia (incluye 0 solo si aplica).";
  } else {
    yearsState = "complete";
    yearsGuidance = "";
  }

  return [
    { key: "target_role", state: targetState, guidance: targetGuidance },
    { key: "summary", state: summaryState, guidance: summaryGuidance },
    { key: "skills", state: skillsState, guidance: skillsGuidance },
    { key: "years_experience", state: yearsState, guidance: yearsGuidance },
  ];
}

export function coreFieldsHaveGap(analysis: CoreFieldAnalysis[]): boolean {
  return analysis.some((a) => a.state !== "complete");
}

export function coreFieldsAllMissing(analysis: CoreFieldAnalysis[]): boolean {
  return analysis.every((a) => a.state === "missing");
}
