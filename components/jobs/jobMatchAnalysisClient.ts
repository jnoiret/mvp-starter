export type MatchAnalysis = {
  match_score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
};

type CandidatePayload = {
  summary: string;
  skills: string;
  tools: string;
  industries: string;
  seniority: string;
  years_experience: number;
};

type JobPayload = {
  title: string;
  company: string;
  description: string;
  requirements: string;
  industry: string;
};

type MatchPayload = {
  candidate_profile: CandidatePayload;
  job_listing: JobPayload;
};

const SESSION_PREFIX = "job-match-analysis:v1:";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildKey(payload: MatchPayload) {
  return `${SESSION_PREFIX}${JSON.stringify(payload)}`;
}

function readSessionCache(key: string): MatchAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as MatchAnalysis;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: MatchAnalysis) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort cache.
  }
}

function toList(value: string) {
  return value
    .split(/[,\n;|/]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fallback(payload: MatchPayload): MatchAnalysis {
  const reqs = toList(payload.job_listing.requirements).map((item) => item.toLowerCase());
  const skills = toList(payload.candidate_profile.skills).map((item) => item.toLowerCase());
  const shared = reqs.filter((item) => skills.includes(item));
  const missing = reqs.filter((item) => !skills.includes(item));
  const ratio = reqs.length > 0 ? shared.length / reqs.length : 0.5;

  return {
    match_score: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    strengths: shared.slice(0, 5).map((item) => `Experiencia en ${item}.`),
    gaps: missing.slice(0, 3).map((item) => `Falta evidencia clara en ${item}.`),
    summary:
      "Vista rápida de señales que influyen en la probabilidad de respuesta (sin detalle de IA en este momento).",
  };
}

export async function getJobMatchAnalysis(payload: MatchPayload): Promise<MatchAnalysis> {
  const normalizedPayload: MatchPayload = {
    candidate_profile: {
      summary: normalizeText(payload.candidate_profile.summary),
      skills: normalizeText(payload.candidate_profile.skills),
      tools: normalizeText(payload.candidate_profile.tools),
      industries: normalizeText(payload.candidate_profile.industries),
      seniority: normalizeText(payload.candidate_profile.seniority),
      years_experience: Number.isFinite(payload.candidate_profile.years_experience)
        ? payload.candidate_profile.years_experience
        : 0,
    },
    job_listing: {
      title: normalizeText(payload.job_listing.title),
      company: normalizeText(payload.job_listing.company),
      description: normalizeText(payload.job_listing.description),
      requirements: normalizeText(payload.job_listing.requirements),
      industry: normalizeText(payload.job_listing.industry),
    },
  };

  const key = buildKey(normalizedPayload);
  const cached = readSessionCache(key);
  if (cached) return cached;

  const response = await fetch("/api/candidate/job-match-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizedPayload),
  });

  if (!response.ok) {
    const fallbackValue = fallback(normalizedPayload);
    writeSessionCache(key, fallbackValue);
    return fallbackValue;
  }

  const body = (await response.json()) as {
    success?: boolean;
    analysis?: MatchAnalysis;
  };

  if (!body.success || !body.analysis) {
    const fallbackValue = fallback(normalizedPayload);
    writeSessionCache(key, fallbackValue);
    return fallbackValue;
  }

  writeSessionCache(key, body.analysis);
  return body.analysis;
}
