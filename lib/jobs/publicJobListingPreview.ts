import type { PublicJobRow } from "@/lib/jobs/publicJob";
import {
  getResponseTierFromScores,
  responseProbabilityBadgeClass,
  responseProbabilityLabel,
  type ResponseProbabilityTier,
} from "@/lib/jobs/responseProbabilityUi";

export const PUBLIC_VACANCY_ADVANCE_HEADING = "Por qué esta vacante suele avanzar";

/**
 * Heuristic 0–5 from **solo datos públicos de la vacante** (sin perfil).
 * Sirve para la misma UI de probabilidad en /jobs sin implicar match personal.
 */
export function publicJobListingStarScore(job: PublicJobRow): number {
  let score = 0;

  const created = job.created_at ? new Date(job.created_at).getTime() : NaN;
  if (!Number.isNaN(created)) {
    const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
    if (days <= 7) score += 2;
    else if (days <= 21) score += 1;
  }

  if (job.salary_range?.trim()) score += 1;

  const desc = job.description?.trim() ?? "";
  if (desc.length >= 200) score += 1;
  else if (desc.length >= 80) score += 1;

  const skills = Array.isArray(job.required_skills)
    ? job.required_skills.length
    : job.required_skills?.split(",").filter(Boolean).length ?? 0;
  if (skills >= 4) score += 1;
  else if (skills >= 2) score += 1;

  const mode = (job.work_mode ?? "").toLowerCase();
  if (mode.includes("remoto") || mode.includes("remote") || mode.includes("híbrido")) {
    score += 1;
  }

  return Math.min(5, Math.max(0, score));
}

/** Orden público: misma jerarquía visual que candidato, sin perfil. */
export function orderJobsForPublicExploration(jobs: PublicJobRow[]): PublicJobRow[] {
  return [...jobs].sort((a, b) => {
    const sa = publicJobListingStarScore(a);
    const sb = publicJobListingStarScore(b);
    if (sb !== sa) return sb - sa;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

/** Narrativa genérica para el panel de detalle (sin “tu perfil”). */
export function getPublicVacancyResponseNarrative(star: number): string {
  if (star >= 4) {
    return "Por señales del anuncio (claridad, recencia y requisitos visibles), esta vacante suele generar más movimiento de respuestas.";
  }
  if (star === 3) {
    return "Señales mixtas en el anuncio: puede haber respuesta, según volumen de candidatos y criterios del reclutador.";
  }
  return "Poca información o señales más débiles en el anuncio; el filtro o la competencia puede ser más exigente.";
}

export function getPublicListingProbabilityPreview(job: PublicJobRow): {
  tier: ResponseProbabilityTier;
  label: string;
  badgeClass: string;
  previewNote: string;
} {
  const star = publicJobListingStarScore(job);
  const tier = getResponseTierFromScores(star, undefined);
  return {
    tier,
    label: responseProbabilityLabel(tier),
    badgeClass: responseProbabilityBadgeClass(tier),
    previewNote:
      "Etiqueta según la claridad del anuncio (recencia, requisitos visibles, etc.), no según tu perfil.",
  };
}

/** Línea corta en cards públicas: calidad del anuncio, sin “competencia” personal. */
export function publicListingSignalLine(star: number): string {
  if (star >= 4) return "Anuncio con bastante información visible.";
  if (star >= 3) return "Anuncio con información moderada.";
  return "Anuncio con poca información visible en el listado.";
}

function inferSeniorityHint(title: string | null): string | null {
  if (!title?.trim()) return null;
  const t = title.toLowerCase();
  if (/\b(senior|sr\.?|lead|principal|staff)\b/i.test(t)) {
    return "Suele pedirse experiencia sénior o de liderazgo técnico.";
  }
  if (/\b(junior|jr\.?|intern|becario)\b/i.test(t)) {
    return "A menudo encaja con perfiles en etapa inicial o primeros años.";
  }
  if (/\b(mid|semi|intermedio)\b/i.test(t)) {
    return "Típicamente orientado a nivel intermedio.";
  }
  return null;
}

/** Bullets genéricos “por qué suele avanzar” — solo anuncio. */
export function getPublicVacancyAdvanceBullets(job: PublicJobRow, max = 3): string[] {
  const bullets: string[] = [];
  const skills = Array.isArray(job.required_skills)
    ? job.required_skills.map((s) => String(s).trim()).filter(Boolean)
    : (job.required_skills ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (skills.length > 0) {
    const top = skills.slice(0, 3).join(", ");
    bullets.push(`Habilidades clave que suelen pedirse: ${top}.`);
  }

  const senior = inferSeniorityHint(job.title);
  if (senior) bullets.push(senior);

  const company = job.company_name?.trim();
  if (company) {
    bullets.push(
      `Sector o empresa visibles (${company}): útil para evaluar contexto del rol.`,
    );
  }

  if (job.salary_range?.trim()) {
    bullets.push("Salario publicado: suele acelerar el filtro de candidatos.");
  }

  const mode = job.work_mode?.trim();
  if (mode && bullets.length < max) {
    bullets.push(`Modalidad declarada (${mode}), relevante para encaje logístico.`);
  }

  if (bullets.length === 0) {
    bullets.push("Revisa la descripción: ahí están los requisitos concretos del puesto.");
  }

  return bullets.slice(0, max);
}

/** @deprecated use getPublicVacancyAdvanceBullets */
export function getPublicJobTeaserBullets(job: PublicJobRow, max = 3): string[] {
  return getPublicVacancyAdvanceBullets(job, max);
}
