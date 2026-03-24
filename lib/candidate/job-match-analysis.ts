export type MatchCandidateProfile = {
  summary: string;
  skills: string;
  tools: string;
  industries: string;
  seniority: string;
  years_experience: number;
};

export type MatchJobListing = {
  title: string;
  company: string;
  description: string;
  requirements: string;
  industry: string;
};

export type JobMatchAnalysis = {
  match_score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
};

type CacheEntry = {
  value: JobMatchAnalysis;
  expiresAt: number;
};

type CacheStore = Map<string, CacheEntry>;

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const CACHE_NAMESPACE = "__job_match_analysis_cache__";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toList(value: string) {
  return value
    .split(/[,\n;|/]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getCacheStore(): CacheStore {
  const globalState = globalThis as unknown as Record<string, CacheStore | undefined>;
  if (!globalState[CACHE_NAMESPACE]) {
    globalState[CACHE_NAMESPACE] = new Map<string, CacheEntry>();
  }
  return globalState[CACHE_NAMESPACE] as CacheStore;
}

function buildCacheKey(candidate: MatchCandidateProfile, job: MatchJobListing) {
  const payload = {
    candidate_profile: {
      summary: normalizeText(candidate.summary),
      skills: normalizeText(candidate.skills),
      tools: normalizeText(candidate.tools),
      industries: normalizeText(candidate.industries),
      seniority: normalizeText(candidate.seniority),
      years_experience: Number.isFinite(candidate.years_experience)
        ? candidate.years_experience
        : 0,
    },
    job_listing: {
      title: normalizeText(job.title),
      company: normalizeText(job.company),
      description: normalizeText(job.description),
      requirements: normalizeText(job.requirements),
      industry: normalizeText(job.industry),
    },
    version: "v1",
  };
  return JSON.stringify(payload);
}

function fallbackMatchAnalysis(
  candidate_profile: MatchCandidateProfile,
  job_listing: MatchJobListing
): JobMatchAnalysis {
  const candidateSkills = toList(candidate_profile.skills).map((item) => item.toLowerCase());
  const jobReqs = toList(job_listing.requirements).map((item) => item.toLowerCase());
  const shared = jobReqs.filter((req) => candidateSkills.includes(req));
  const missing = jobReqs.filter((req) => !candidateSkills.includes(req));
  const ratio = jobReqs.length > 0 ? shared.length / jobReqs.length : 0.5;
  const experienceBoost = Math.min(
    0.2,
    Math.max(0, (candidate_profile.years_experience - 1) * 0.03)
  );
  const score = clampScore((ratio + experienceBoost) * 100);
  return {
    match_score: score,
    strengths: shared.slice(0, 5).map((item) => `Experiencia en ${item}.`),
    gaps: missing.slice(0, 3).map((item) => `Falta evidencia clara en ${item}.`),
    summary:
      score >= 75
        ? "Alta probabilidad de respuesta según señales básicas del rol y tu perfil."
        : score >= 55
          ? "Probabilidad media: hay margen para reforzar señales y mejorar el avance."
          : "Probabilidad de respuesta baja por ahora; conviene reforzar requisitos clave.",
  };
}

function sanitizeAnalysis(input: unknown): JobMatchAnalysis | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const rawScore = typeof raw.match_score === "number" ? raw.match_score : Number(raw.match_score);
  const rawStrengths = Array.isArray(raw.strengths) ? raw.strengths : [];
  const rawGaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  const rawSummary = typeof raw.summary === "string" ? raw.summary : "";

  const strengths = rawStrengths
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 5);
  const gaps = rawGaps
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!Number.isFinite(rawScore)) return null;
  return {
    match_score: clampScore(rawScore),
    strengths,
    gaps,
    summary: normalizeText(rawSummary).slice(0, 240),
  };
}

export async function generateJobMatchAnalysis(
  candidate_profile: MatchCandidateProfile,
  job_listing: MatchJobListing
): Promise<JobMatchAnalysis> {
  const cacheKey = buildCacheKey(candidate_profile, job_listing);
  const cacheStore = getCacheStore();
  const now = Date.now();
  const cached = cacheStore.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = fallbackMatchAnalysis(candidate_profile, job_listing);
    cacheStore.set(cacheKey, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }

  const schema = {
    name: "job_match_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["match_score", "strengths", "gaps", "summary"],
      properties: {
        match_score: { type: "number" },
        strengths: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 5,
        },
        gaps: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
        },
        summary: { type: "string" },
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content: [
            "Eres un analista de reclutamiento enfocado en probabilidad de respuesta o entrevista.",
            "Responde solo JSON valido usando el esquema indicado.",
            "Analiza señales entre candidate_profile y job_listing que expliquen esa probabilidad.",
            "Devuelve match_score (0-100) como intensidad de esas señales, 3-5 strengths, 2-3 gaps y summary breve.",
            "Reglas: se realista, no inventes habilidades faltantes, usa espanol, explicaciones cortas.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ candidate_profile, job_listing }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const fallback = fallbackMatchAnalysis(candidate_profile, job_listing);
    cacheStore.set(cacheKey, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    const fallback = fallbackMatchAnalysis(candidate_profile, job_listing);
    cacheStore.set(cacheKey, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const sanitized = sanitizeAnalysis(parsed);
    const finalAnalysis = sanitized ?? fallbackMatchAnalysis(candidate_profile, job_listing);
    cacheStore.set(cacheKey, { value: finalAnalysis, expiresAt: now + CACHE_TTL_MS });
    return finalAnalysis;
  } catch {
    const fallback = fallbackMatchAnalysis(candidate_profile, job_listing);
    cacheStore.set(cacheKey, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}
