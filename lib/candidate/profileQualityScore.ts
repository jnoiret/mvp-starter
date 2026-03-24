/**
 * Rules-based profile quality (0–100) and actionable recommendations.
 * No AI — deterministic scoring from field presence and simple heuristics.
 */

export type ProfileQualityInput = {
  full_name?: string | null;
  summary?: string | null;
  skills?: string | null;
  target_role?: string | null;
  city?: string | null;
  work_mode?: string | null;
  expected_salary?: number | string | null;
  years_experience?: number | string | null;
  industries?: string | null;
};

export type ProfileQualityTier = "low" | "medium" | "high";

export type ProfileQualityRecommendation = {
  id: string;
  text: string;
};

const PLACEHOLDER_SKILLS = new Set(
  ["por completar en tu perfil", "por completar en tu perfil."].map((s) => s.toLowerCase()),
);

function trim(s: string | null | undefined) {
  return (s ?? "").trim();
}

function parseYears(value: ProfileQualityInput["years_experience"]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSalary(value: ProfileQualityInput["expected_salary"]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Distinct skill tokens from comma/semicolon/pipe-separated text. */
export function countProfileSkills(skills: string | null | undefined): number {
  const s = trim(skills);
  if (!s) return 0;
  if (PLACEHOLDER_SKILLS.has(s.toLowerCase())) return 0;
  return s
    .split(/[,;/|]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .length;
}

function scoreSummary(summary: string): number {
  const len = trim(summary).length;
  if (len >= 120) return 16;
  if (len >= 60) return 12;
  if (len >= 30) return 7;
  if (len > 0) return 3;
  return 0;
}

function scoreSkills(skills: string): number {
  const n = countProfileSkills(skills);
  if (n >= 6) return 22;
  if (n >= 4) return 18;
  if (n >= 3) return 14;
  if (n >= 2) return 9;
  if (n >= 1) return 5;
  return 0;
}

function scoreTargetRole(role: string): number {
  const r = trim(role).toLowerCase();
  if (!r || r === "por definir") return 0;
  if (r.length < 4) return 8;
  const words = r.split(/\s+/).filter(Boolean);
  if (words.length === 1 && r.length < 14) return 12;
  return 16;
}

function scoreYears(years: number | null): number {
  if (years === null) return 5;
  if (years <= 0) return 8;
  if (years <= 2) return 10;
  if (years <= 5) return 12;
  return 13;
}

function scoreFullName(name: string): number {
  return trim(name).length >= 2 ? 8 : 0;
}

function scoreCity(city: string): number {
  const c = trim(city).toLowerCase();
  if (!c || c === "por definir") return 0;
  return 7;
}

function scoreWorkMode(mode: string): number {
  return trim(mode) ? 7 : 0;
}

function scoreSalary(salary: number | null): number {
  if (salary === null || salary <= 0) return 2;
  if (salary <= 1) return 3;
  return 6;
}

function scoreIndustries(ind: string): number {
  return trim(ind).length >= 3 ? 5 : 0;
}

export function getProfileQualityTier(score: number): ProfileQualityTier {
  if (score < 40) return "low";
  if (score < 70) return "medium";
  return "high";
}

export function getProfileQualityLabelEs(tier: ProfileQualityTier): string {
  if (tier === "low") return "Bajo";
  if (tier === "medium") return "Medio";
  return "Alto";
}

/**
 * Components sum to ≤ 100; clamped at 100 after sum.
 * Breakdown: summary(16) + skills(22) + target_role(16) + years(13) + full_name(8)
 * + city(7) + work_mode(7) + salary(6) + industries(5) = 100 at max.
 */
export function computeProfileQualityScore(profile: ProfileQualityInput | null | undefined): number {
  if (!profile) return 0;

  const years = parseYears(profile.years_experience);
  const salary = parseSalary(profile.expected_salary);

  const parts =
    scoreSummary(profile.summary ?? "") +
    scoreSkills(profile.skills ?? "") +
    scoreTargetRole(profile.target_role ?? "") +
    scoreYears(years) +
    scoreFullName(profile.full_name ?? "") +
    scoreCity(profile.city ?? "") +
    scoreWorkMode(profile.work_mode ?? "") +
    scoreSalary(salary) +
    scoreIndustries(profile.industries ?? "");

  return Math.min(100, Math.max(0, Math.round(parts)));
}

const REC_SUMMARY =
  "Completa tu resumen profesional: 2–4 frases sobre tu impacto y especialidad ayudan a priorizarte.";
const REC_SKILLS =
  "Agrega más habilidades relevantes (herramientas, stack, metodologías) separadas por coma.";
const REC_ROLE = "Define mejor tu rol objetivo: un título claro mejora el encaje con las vacantes.";
const REC_CITY = "Indica tu ciudad o región (o confirma si buscas 100% remoto).";
const REC_WORK_MODE = "Elige tu modalidad de trabajo preferida (remoto, híbrido, presencial…).";
const REC_SALARY = "Actualiza tu expectativa salarial para alinear mejor con rangos de las vacantes.";
const REC_YEARS = "Añade tus años de experiencia para contextualizar tu nivel.";
const REC_NAME = "Revisa que tu nombre completo esté bien escrito.";
const REC_INDUSTRIES = "Menciona industrias o sectores de interés para refinar recomendaciones.";

const REC_POLISH_SUMMARY =
  "Opcional: añade 1–2 logros con métricas en el resumen para destacar ante reclutadores.";
const REC_POLISH_SKILLS =
  "Ordena habilidades de más a menos relevante para el rol que buscas.";
const REC_MAINTAIN =
  "Tu perfil cubre los campos clave. Mantenlo actualizado cuando cambies de empleo o stack.";

/**
 * 3–5 suggestions, ordered by impact (missing core fields first).
 */
export function buildProfileQualityRecommendations(
  profile: ProfileQualityInput | null | undefined,
): ProfileQualityRecommendation[] {
  if (!profile) {
    return [
      { id: "basics", text: "Completa tu perfil para ver recomendaciones personalizadas." },
    ];
  }

  type Cand = { id: string; text: string; priority: number };
  const out: Cand[] = [];

  const summaryLen = trim(profile.summary ?? "").length;
  if (summaryLen < 40) {
    out.push({ id: "summary", text: REC_SUMMARY, priority: 1 });
  }

  const skillCount = countProfileSkills(profile.skills);
  if (skillCount < 3) {
    out.push({ id: "skills", text: REC_SKILLS, priority: 2 });
  }

  const role = trim(profile.target_role).toLowerCase();
  if (!role || role === "por definir" || role.length < 4) {
    out.push({ id: "target_role", text: REC_ROLE, priority: 3 });
  }

  const city = trim(profile.city).toLowerCase();
  if (!city || city === "por definir") {
    out.push({ id: "city", text: REC_CITY, priority: 4 });
  }

  if (!trim(profile.work_mode ?? "")) {
    out.push({ id: "work_mode", text: REC_WORK_MODE, priority: 5 });
  }

  const salary = parseSalary(profile.expected_salary);
  if (salary === null || salary <= 1) {
    out.push({ id: "salary", text: REC_SALARY, priority: 6 });
  }

  const rawYears = profile.years_experience;
  const yearsUnset =
    rawYears === null ||
    rawYears === undefined ||
    (typeof rawYears === "string" && !rawYears.trim());
  if (yearsUnset) {
    out.push({ id: "years", text: REC_YEARS, priority: 7 });
  }

  if (trim(profile.full_name ?? "").length < 2) {
    out.push({ id: "full_name", text: REC_NAME, priority: 8 });
  }

  if (trim(profile.industries ?? "").length < 3) {
    out.push({ id: "industries", text: REC_INDUSTRIES, priority: 9 });
  }

  out.sort((a, b) => a.priority - b.priority);

  if (out.length === 0) {
    return [
      { id: "maintain", text: REC_MAINTAIN },
      { id: "polish_summary", text: REC_POLISH_SUMMARY },
      { id: "polish_skills", text: REC_POLISH_SKILLS },
    ];
  }

  let base: ProfileQualityRecommendation[] = out
    .slice(0, 5)
    .map(({ id, text }) => ({ id, text }));

  const polishFallback: ProfileQualityRecommendation[] = [
    { id: "polish_summary", text: REC_POLISH_SUMMARY },
    { id: "polish_skills", text: REC_POLISH_SKILLS },
    { id: "maintain", text: REC_MAINTAIN },
  ];

  const have = new Set(base.map((b) => b.id));
  for (const p of polishFallback) {
    if (base.length >= 3) break;
    if (!have.has(p.id)) {
      base.push(p);
      have.add(p.id);
    }
  }

  return base.slice(0, 5);
}

export function analyzeProfileQuality(profile: ProfileQualityInput | null | undefined) {
  const score = computeProfileQualityScore(profile);
  const tier = getProfileQualityTier(score);
  const label = getProfileQualityLabelEs(tier);
  const recommendations = buildProfileQualityRecommendations(profile);
  return { score, tier, label, recommendations };
}
