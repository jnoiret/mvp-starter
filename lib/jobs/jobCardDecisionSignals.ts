import type { ResponseProbabilityTier } from "@/lib/jobs/responseProbabilityUi";
import { whyProbabilitySectionHeading } from "@/lib/jobs/responseProbabilityUi";

export type JobCardJob = {
  title?: string | null;
  company_name?: string | null;
  description?: string | null;
  required_skills?: string | string[] | null;
  city?: string | null;
  work_mode?: string | null;
  salary_range?: string | null;
};

/** Ubicación, modalidad y salario en líneas breves para jerarquía visual. */
export function getJobCardMetaLines(job: JobCardJob): {
  ubicacion: string;
  modalidad: string;
  salario: string;
} {
  const workMode = job.work_mode?.trim() || "No especificada";
  const modeNorm = normalize(workMode);
  const remote = modeNorm.includes("remoto") || modeNorm.includes("remote");
  const ubicacion = remote ? "Remoto" : job.city?.trim() || "No especificada";
  const rawSalary = job.salary_range?.replace(/\s*-\s*/g, " – ").trim();
  const salario = rawSalary && rawSalary.length > 0 ? rawSalary : "No especificado";
  return { ubicacion, modalidad: workMode, salario };
}

export type JobCardCandidate = {
  target_role?: string | null;
  skills?: string | null;
  industries?: string | null;
  years_experience?: number | null;
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

function toSkillList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
}

function roleMatchesClosely(targetRole: string | null | undefined, jobTitle: string | null | undefined) {
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

function formatSkillDisplay(skill: string) {
  return skill
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function industryOverlapBullet(
  industries: string | null | undefined,
  job: JobCardJob,
): string | null {
  const raw = (industries ?? "").trim();
  if (!raw) return null;
  const industryTokens = raw
    .split(/[,\n;/|]/)
    .map((s) => normalize(s))
    .filter((t) => t.length >= 3);
  if (industryTokens.length === 0) return null;

  const haystack = normalize(
    [job.title, job.company_name, job.description].filter(Boolean).join(" ")
  );
  if (!haystack) return null;

  const hits = industryTokens.filter((t) => haystack.includes(t));
  if (hits.length === 0) return null;

  const label = raw
    .split(/[,\n;/|]/)[0]
    ?.trim()
    .slice(0, 48);
  if (label) {
    return `Sector/industria afín: reflejas experiencia en ${label}.`;
  }
  return "Tu sector o industria declarada encaja con señales de la vacante.";
}

/**
 * 2–3 short bullets for job cards: experiencia, skills, sector — usando solo perfil + vacante (+ opcional IA).
 */
export function getJobCardWhyBullets(
  job: JobCardJob,
  candidate: JobCardCandidate | null,
  options?: { aiStrengths?: string[]; max?: number },
): string[] {
  const max = Math.min(3, Math.max(2, options?.max ?? 3));
  const bullets: string[] = [];

  if (!candidate) {
    return [
      "Completa rol objetivo y habilidades en tu perfil.",
      "Verás aquí señales más precisas por vacante.",
    ].slice(0, max);
  }

  const titleShort = (job.title ?? "este puesto").trim();

  if (roleMatchesClosely(candidate.target_role, job.title)) {
    bullets.push(`Experiencia relevante: tu rol objetivo encaja con «${titleShort}».`);
  } else if (
    typeof candidate.years_experience === "number" &&
    Number.isFinite(candidate.years_experience) &&
    candidate.years_experience >= 1
  ) {
    bullets.push(
      `Trayectoria: ${candidate.years_experience} años de experiencia como contexto para este rol.`,
    );
  }

  const required = toSkillList(job.required_skills);
  const cand = toSkillList(candidate.skills);
  const sharedKeys = required.filter((s) => cand.includes(s));
  if (sharedKeys.length > 0) {
    const labels = sharedKeys.slice(0, 2).map((k) => {
      const original =
        Array.isArray(job.required_skills) && job.required_skills.length > 0
          ? job.required_skills.find((x) => typeof x === "string" && normalize(x) === k)
          : (job.required_skills as string | null)?.split(",").find((x) => normalize(x) === k);
      return formatSkillDisplay(typeof original === "string" ? original.trim() : k);
    });
    bullets.push(`Skills clave que ya muestras: ${labels.join(" · ")}.`);
  }

  const ind = industryOverlapBullet(candidate.industries, job);
  if (ind) bullets.push(ind);

  const ai = options?.aiStrengths ?? [];
  for (const line of ai) {
    if (bullets.length >= max) break;
    const t = line.replace(/^[\s•\-]+/, "").trim();
    if (t.length < 8) continue;
    if (bullets.some((b) => b.slice(0, 40) === t.slice(0, 40))) continue;
    bullets.push(t.length > 120 ? `${t.slice(0, 117)}…` : t);
  }

  if (bullets.length < 2) {
    bullets.push(
      !candidate.target_role?.trim()
        ? "Añade un rol objetivo claro para priorizar vacantes con más respuesta."
        : sharedKeys.length === 0 && required.length > 0
          ? "Refuerza en tu perfil las habilidades marcadas como requisito."
          : "Ajusta tu CV a logros medibles ligados a este puesto.",
    );
  }
  if (bullets.length < 2) {
    bullets.push("Alinea modalidad y ubicación con lo que buscas en esta vacante.");
  }

  return bullets.slice(0, max);
}

export function jobCardWhyHeading(tier: ResponseProbabilityTier): string {
  return whyProbabilitySectionHeading(tier);
}
