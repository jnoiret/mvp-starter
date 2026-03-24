import type { ResponseProbabilityTier } from "@/lib/jobs/responseProbabilityUi";

const MAX_ITEMS = 5;

export type JobRequirementBreakdownJob = {
  title: string | null;
  required_skills: string | string[] | null;
  description: string | null;
};

export type JobRequirementBreakdownCandidate = {
  target_role: string | null;
  skills: string | null;
  years_experience: number | null;
};

export type JobRequirementBreakdown = {
  tier: ResponseProbabilityTier;
  cumplesCon: string[];
  teFalta: string[];
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSkillListRaw(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  return value
    .split(/[,;\n|/]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNormalizedSkillSet(skillsCsv: string | null): string[] {
  if (!skillsCsv?.trim()) return [];
  return skillsCsv
    .split(/[,;\n|/]+/g)
    .map((s) => normalize(s))
    .filter(Boolean);
}

function roleMatchesClosely(targetRole: string | null, jobTitle: string | null) {
  if (!targetRole || !jobTitle) return false;
  const role = normalize(targetRole);
  const title = normalize(jobTitle);
  if (!role || !title) return false;
  if (role === title || role.includes(title) || title.includes(role)) return true;
  const roleTokens = role.split(" ").filter(Boolean);
  const titleTokens = title.split(" ").filter(Boolean);
  if (roleTokens.length === 0 || titleTokens.length === 0) return false;
  const overlap = roleTokens.filter((token) => titleTokens.includes(token)).length;
  const ratio = overlap / Math.max(roleTokens.length, titleTokens.length);
  return ratio >= 0.6;
}

/** Heuristic: minimum years of experience mentioned in the posting (Spanish/English). */
export function parseMinYearsFromJobDescription(description: string | null): number | null {
  if (!description?.trim()) return null;
  const text = description;
  const found: number[] = [];

  const patterns: RegExp[] = [
    /(?:mínimo|minimo|al menos|minimum|min\.?)\s*(?:de\s*)?(\d{1,2})\s*(?:años?|years?|yrs?\.?)/gi,
    /(\d{1,2})\s*\+\s*(?:años?|years?)/gi,
    /(?:con|con al menos|with)\s+(\d{1,2})\s*(?:años?|years?)(?:\s+de\s+experiencia)?/gi,
    /(\d{1,2})\s*(?:años?|years?)\s+(?:de\s+)?(?:experiencia|experience)/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 30) found.push(n);
    }
  }

  if (found.length === 0) return null;
  return Math.max(...found);
}

function skillMatchesCandidate(candidateNormSkills: string[], requirementRaw: string): boolean {
  const r = normalize(requirementRaw);
  if (!r) return false;
  if (candidateNormSkills.includes(r)) return true;

  const reqTokens = r.split(" ").filter(Boolean);
  if (reqTokens.length === 0) return false;

  for (const cs of candidateNormSkills) {
    if (!cs) continue;
    if (cs === r || cs.includes(r) || r.includes(cs)) return true;
    const ct = cs.split(" ").filter(Boolean);
    const hit = reqTokens.filter(
      (t) => ct.includes(t) || ct.some((c) => c.includes(t) || t.includes(c)),
    ).length;
    if (hit / reqTokens.length >= 0.5) return true;
  }
  return false;
}

function formatSkillPhrase(raw: string) {
  const t = raw.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function takeUniqueLines(items: string[], max = MAX_ITEMS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of items) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Compares profile vs job on target_role, required_skills, and years (from description heuristic).
 * Neutral copy only — no coaching to “optimize” the profile.
 */
export function computeJobRequirementBreakdown(
  job: JobRequirementBreakdownJob,
  candidate: JobRequirementBreakdownCandidate | null,
): JobRequirementBreakdown {
  if (!candidate) {
    return {
      tier: "medium",
      cumplesCon: [],
      teFalta: ["No hay perfil de candidato para comparar."],
    };
  }

  const roleOk = roleMatchesClosely(candidate.target_role, job.title);
  const rawReqSkills = toSkillListRaw(job.required_skills);
  const candidateNormSkills = toNormalizedSkillSet(candidate.skills);

  const matchedRaw = rawReqSkills.filter((s) => skillMatchesCandidate(candidateNormSkills, s));
  const unmatchedRaw = rawReqSkills.filter((s) => !skillMatchesCandidate(candidateNormSkills, s));

  const minYears = parseMinYearsFromJobDescription(job.description);
  const candYears =
    typeof candidate.years_experience === "number" && Number.isFinite(candidate.years_experience)
      ? candidate.years_experience
      : null;

  let yearsStatus: "ok" | "below" | "unknown" | "unclear_candidate" = "unknown";
  if (minYears == null) yearsStatus = "unknown";
  else if (candYears == null) yearsStatus = "unclear_candidate";
  else if (candYears >= minYears) yearsStatus = "ok";
  else yearsStatus = "below";

  const nReq = rawReqSkills.length;
  const nMatch = matchedRaw.length;
  const roleFail = !roleOk;
  const skillFail = nReq > 0 && nMatch === 0;
  const yearFail = yearsStatus === "below";

  const failures = [roleFail, skillFail, yearFail].filter(Boolean).length;
  let tier: ResponseProbabilityTier;
  if (failures === 0) tier = "high";
  else if (failures >= 2) tier = "low";
  else tier = "medium";

  const cumplesCon: string[] = [];
  const teFalta: string[] = [];

  if (roleOk) {
    cumplesCon.push("Tu rol objetivo se acerca al título publicado para esta vacante.");
  } else if (job.title?.trim()) {
    teFalta.push(
      "El título de la vacante no se alinea de forma clara con tu rol objetivo declarado.",
    );
  }

  if (nReq === 0) {
    cumplesCon.push(
      "El anuncio no lista habilidades concretas; el cruce por skills es limitado.",
    );
  } else   if (nMatch > 0) {
    const shown = matchedRaw.slice(0, 4).map(formatSkillPhrase);
    const extra = nMatch > 4 ? ` (y ${nMatch - 4} más en el anuncio)` : "";
    cumplesCon.push(`Coincidencias con habilidades del anuncio: ${shown.join(", ")}${extra}.`);
  }

  if (nReq > 0 && unmatchedRaw.length > 0) {
    const shown = unmatchedRaw.slice(0, 4).map(formatSkillPhrase);
    const extra = unmatchedRaw.length > 4 ? ` (y ${unmatchedRaw.length - 4} más en el anuncio)` : "";
    teFalta.push(
      `En el anuncio figuran habilidades que, con los datos que comparamos, no constan en tu perfil: ${shown.join(", ")}${extra}.`,
    );
  }

  if (yearsStatus === "ok" && minYears != null) {
    cumplesCon.push(
      `Tu experiencia declarada está en línea con el mínimo aproximado que sugiere el anuncio (${minYears}+ años).`,
    );
  } else if (yearsStatus === "below" && minYears != null && candYears != null) {
    teFalta.push(
      `El anuncio sugiere alrededor de ${minYears}+ años de experiencia; en tu perfil constan menos.`,
    );
  } else if (yearsStatus === "unclear_candidate" && minYears != null) {
    teFalta.push(
      "El anuncio menciona un mínimo de experiencia y tu perfil no tiene años declarados de forma clara para comparar.",
    );
  } else if (yearsStatus === "unknown" && minYears == null) {
    cumplesCon.push("No detectamos un mínimo de años claro en el texto del anuncio.");
  }

  if (cumplesCon.length === 0) {
    cumplesCon.push("Puedes revisar el anuncio completo para ver el contexto del rol.");
  }

  if (teFalta.length === 0) {
    teFalta.push("No destacamos carencias adicionales frente a los tres criterios que comparamos.");
  }

  return {
    tier,
    cumplesCon: takeUniqueLines(cumplesCon, MAX_ITEMS),
    teFalta: takeUniqueLines(teFalta, MAX_ITEMS),
  };
}

/** Vista pública: qué suele valorarse en el anuncio, sin comparar con un perfil. */
export function buildAnonymousJobBreakdownPreview(job: JobRequirementBreakdownJob): {
  cumplesCon: string[];
  teFalta: string[];
  footnote: string;
} {
  const cumplesCon: string[] = [];
  if (job.title?.trim()) {
    cumplesCon.push(`Rol publicado: ${job.title.trim()}.`);
  }
  const raw = toSkillListRaw(job.required_skills);
  if (raw.length > 0) {
    cumplesCon.push(
      `Requisitos de habilidades listados en el anuncio (ejemplos): ${raw
        .slice(0, 3)
        .map(formatSkillPhrase)
        .join(", ")}.`,
    );
  }
  const minY = parseMinYearsFromJobDescription(job.description);
  if (minY != null) {
    cumplesCon.push(`El texto del anuncio sugiere experiencia en torno a ${minY}+ años.`);
  }
  if (cumplesCon.length === 0) {
    cumplesCon.push("Revisa la descripción del anuncio para ver requisitos concretos.");
  }

  const teFalta = [
    "Sin una sesión de candidato no comparamos esto con un perfil.",
    "Iniciar sesión permite ver coincidencias y diferencias respecto a tus datos.",
  ];

  return {
    cumplesCon: takeUniqueLines(cumplesCon, MAX_ITEMS),
    teFalta: teFalta.slice(0, 2),
    footnote:
      "Vista informativa del anuncio. La probabilidad mostrada en listas se basa en señales del propio anuncio, no en tu perfil.",
  };
}
