/**
 * Post-process CV parse output: clean skills and job titles before API/UI.
 * Does not call LLMs — deterministic rules only.
 */

const MAX_SKILLS = 12;
const MIN_SKILL_LEN = 2;

/** Standalone connector / filler tokens (whole skill equals this → drop). */
const CONNECTOR_ONLY = new Set([
  "y",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "con",
  "por",
  "para",
  "en",
  "al",
  "o",
  "a",
]);

/** Meaningless or noisy skills when alone or as primary content. */
const NOISY_SKILL_EXACT = new Set([
  "corporativas",
  "corporativo",
  "general",
  "varios",
  "varias",
  "diversas",
  "otras",
  "habilidades",
  "skills",
  "competencias",
]);

const ROLE_HINT =
  /desarroll|engineer|ingeniero|diseñ|designer|analyst|analista|data|product|manager|gerente|lead|developer|devops|consult|sales|ventas|marketing|ux|ui|qa|sre|cloud|full\s*stack|front|back|end|chef|médico|abogado|contador|arquitecto|scrum|agile|pmo|hr|recursos\s+humanos|finanzas|operaciones|logística|comercial|profesional/i;

const FALLBACK_ROLE = "Profesional";

/** Combined titles like "PM | fintech | AI products" — first segment is role, tail is industry/spec. */
const PIPE_SEGMENT_SPLIT = /\s*\|\s*/;

/**
 * Known industry phrases (normalized lowercase key → canonical label).
 * Tail segments that match exactly (after trim + space collapse) go to `industries`, not `target_role`.
 */
const INDUSTRY_ENTRIES: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ["fintech", "financial technology", "fin tech"], label: "Fintech" },
  { keys: ["banking", "banks", "retail banking"], label: "Banking" },
  { keys: ["insurance", "insurtech"], label: "Insurance" },
  {
    keys: ["healthcare", "health care", "healthtech", "health tech", "medtech", "medical"],
    label: "Healthcare",
  },
  { keys: ["edtech", "education technology", "education"], label: "Education" },
  { keys: ["e-commerce", "ecommerce", "online retail"], label: "E-commerce" },
  { keys: ["retail", "brick and mortar"], label: "Retail" },
  { keys: ["saas", "software as a service"], label: "SaaS" },
  { keys: ["b2b"], label: "B2B" },
  { keys: ["b2c"], label: "B2C" },
  { keys: ["manufacturing", "industrial"], label: "Manufacturing" },
  { keys: ["logistics", "supply chain", "transportation"], label: "Logistics" },
  { keys: ["telecom", "telecommunications", "telco"], label: "Telecommunications" },
  { keys: ["media", "entertainment"], label: "Media" },
  { keys: ["advertising", "adtech", "marketing services"], label: "Advertising" },
  { keys: ["gaming", "games", "video games"], label: "Gaming" },
  { keys: ["automotive", "mobility"], label: "Automotive" },
  { keys: ["pharma", "pharmaceutical", "pharmaceuticals"], label: "Pharmaceuticals" },
  { keys: ["biotech", "biotechnology"], label: "Biotechnology" },
  { keys: ["energy", "utilities", "oil and gas"], label: "Energy" },
  { keys: ["aerospace"], label: "Aerospace" },
  { keys: ["defense", "defence"], label: "Defense" },
  { keys: ["government", "public sector"], label: "Government" },
  { keys: ["nonprofit", "non-profit", "ngo"], label: "Nonprofit" },
  { keys: ["agriculture", "agtech", "agritech"], label: "Agriculture" },
  { keys: ["real estate", "realestate", "prop tech", "proptech"], label: "Real estate" },
  { keys: ["hospitality", "tourism", "travel"], label: "Hospitality" },
  { keys: ["food and beverage", "food & beverage", "f&b"], label: "Food and beverage" },
  { keys: ["consumer goods", "cpg", "fmcg"], label: "Consumer goods" },
  { keys: ["luxury"], label: "Luxury" },
  { keys: ["fashion", "apparel"], label: "Fashion" },
  { keys: ["beauty", "cosmetics"], label: "Beauty" },
  { keys: ["legal", "legaltech"], label: "Legal" },
  { keys: ["cybersecurity", "infosec", "information security"], label: "Cybersecurity" },
  { keys: ["cleantech", "clean tech", "climate tech"], label: "Cleantech" },
  { keys: ["consulting", "consultancy", "professional services"], label: "Consulting" },
  { keys: ["construction", "built environment"], label: "Construction" },
  { keys: ["mining"], label: "Mining" },
  { keys: ["telecoms"], label: "Telecommunications" },
  { keys: ["tecnología financiera", "sector financiero"], label: "Fintech" },
  { keys: ["sector salud", "salud"], label: "Healthcare" },
];

function buildIndustryLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const { keys, label } of INDUSTRY_ENTRIES) {
    for (const k of keys) {
      m.set(k.trim().toLowerCase().replace(/\s+/g, " "), label);
    }
  }
  return m;
}

const INDUSTRY_LOOKUP = buildIndustryLookup();

const PHRASE_ACRONYMS = new Set([
  "ai",
  "ml",
  "ui",
  "ux",
  "api",
  "nlp",
  "llm",
  "iot",
  "gpu",
  "ci",
  "cd",
  "crm",
  "erp",
  "hr",
  "it",
  "qa",
]);

function normalizeSegmentKey(segment: string): string {
  return segment.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchKnownIndustry(segment: string): string | null {
  const key = normalizeSegmentKey(segment);
  if (!key) return null;
  return INDUSTRY_LOOKUP.get(key) ?? null;
}

/** Title-case a descriptor (industry tails already use canonical labels). */
function capitalizeWordToken(word: string): string {
  const w = word.trim();
  if (!w) return "";
  const lower = w.toLowerCase();
  if (PHRASE_ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^[A-Z0-9]{2,5}$/.test(w) && /[0-9]/.test(w)) return w;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function toPhraseDisplayCase(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const allCapsBlock =
    tokens.length > 0 &&
    tokens.every((tok) => /^[A-ZÁÉÍÓÚÑ0-9.+#\-/]+$/.test(tok) && /[A-ZÁÉÍÓÚÑ]/.test(tok));
  if (allCapsBlock) {
    return tokens
      .map((token) =>
        token.split("-").map((p) => capitalizeWordToken(p)).join("-"),
      )
      .join(" ");
  }
  return tokens
    .map((token) => token.split("-").map((p) => capitalizeWordToken(p)).join("-"))
    .join(" ");
}

function splitPipeSegments(raw: string): string[] {
  return raw
    .split(PIPE_SEGMENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitCsvLoose(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pushClassifiedTail(
  segment: string,
  industriesOut: string[],
  specsOut: string[],
): void {
  const label = matchKnownIndustry(segment);
  if (label) {
    industriesOut.push(label);
    return;
  }
  const spec = toPhraseDisplayCase(segment);
  if (spec) specsOut.push(spec);
}

/**
 * First segment → job title text; tail segments → industries (if known) or specializations.
 */
export function extractRoleIndustriesSpecializations(raw: string): {
  role: string;
  industries: string[];
  specializations: string[];
} {
  const segments = splitPipeSegments(raw);
  if (segments.length === 0) {
    return { role: "", industries: [], specializations: [] };
  }
  if (segments.length === 1) {
    return { role: segments[0] ?? "", industries: [], specializations: [] };
  }
  const role = segments[0] ?? "";
  const industries: string[] = [];
  const specializations: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg) pushClassifiedTail(seg, industries, specializations);
  }
  return { role, industries, specializations };
}

function mergeDedupedCsv(items: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(", ");
}

function normalizeIndustryCsvToken(segment: string): string {
  const t = segment.trim();
  if (!t) return "";
  return matchKnownIndustry(t) ?? toPhraseDisplayCase(t);
}

function normalizeSpecCsvToken(segment: string): string {
  const t = segment.trim();
  if (!t) return "";
  return toPhraseDisplayCase(t);
}

function splitSkillInput(raw: string): string[] {
  return raw
    .split(/[,;•·|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Remove leading/trailing junk fragments from a skill phrase. */
function stripConnectorNoise(phrase: string): string {
  let s = phrase.replace(/\s+y\s+control\b/gi, " ").trim();
  s = s.replace(/^\s*(y|de|del|con|en|la|el|los|las|un|una|por|para)\s+/gi, "").trim();
  s = s.replace(/\s+\b(y|de|con|en|del)\s*$/gi, "").trim();
  s = s.replace(/^\s*y\s+/i, "").trim();
  return s;
}

function isNoiseSkillToken(s: string): boolean {
  const t = s.trim();
  const lower = t.toLowerCase();
  if (t.length < MIN_SKILL_LEN) return true;
  if (CONNECTOR_ONLY.has(lower)) return true;
  if (NOISY_SKILL_EXACT.has(lower)) return true;
  if (/^y\s+control$/i.test(t)) return true;
  if (/^de\s+la\s+/i.test(t) && t.length < 12) return true;
  return false;
}

/** Title-case skill; soften ALL CAPS; keep short acronyms. */
function toSkillDisplayCase(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "";

  const tokens = trimmed.split(/\s+/);
  const allCapsBlock =
    tokens.length > 0 &&
    tokens.every((tok) => /^[A-ZÁÉÍÓÚÑ0-9.+#]+$/.test(tok) && /[A-ZÁÉÍÓÚÑ]/.test(tok));

  if (allCapsBlock) {
    return tokens
      .map((token) => {
        if (/^[A-Z0-9]{2,5}$/.test(token)) return token;
        const lower = token.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeOneSkill(raw: string): string | null {
  let s = stripConnectorNoise(raw);
  if (!s || isNoiseSkillToken(s)) return null;
  if (isNoiseSkillToken(s.split(/\s+/)[0] ?? "") && s.split(/\s+/).length === 1) return null;
  s = toSkillDisplayCase(s);
  if (!s || isNoiseSkillToken(s)) return null;
  if (s.length > 80) s = `${s.slice(0, 77)}…`;
  return s;
}

/**
 * Merge skills + tools strings, normalize, dedupe (case-insensitive), cap at MAX_SKILLS.
 */
export function mergeAndNormalizeSkills(skillsCsv: string, toolsCsv: string): string {
  const pieces = [...splitSkillInput(skillsCsv), ...splitSkillInput(toolsCsv)];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const piece of pieces) {
    const norm = normalizeOneSkill(piece);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= MAX_SKILLS) break;
  }

  return out.join(", ");
}

function looksInvalidRole(rawRole: string): boolean {
  const role = rawRole.trim();
  if (!role) return true;
  if (role.length < 3 || role.length > 80) return true;

  const tokens = role.split(/\s+/).filter(Boolean);
  const hasOnlyNameLikeTokens =
    tokens.length >= 2 &&
    tokens.every((token) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(token));
  if (hasOnlyNameLikeTokens) return true;

  const letters = (role.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/g) ?? []).length;
  const symbols = (role.match(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]/g) ?? []).length;
  if (letters === 0) return true;
  if (symbols > Math.max(3, Math.floor(role.length * 0.2))) return true;

  const upperRatio =
    role.length > 0 ? (role.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length / role.length : 0;
  if (upperRatio > 0.85 && tokens.length <= 2) return true;

  return false;
}

const SINGLE_WORD_ROLE_ALLOW = new Set(
  [
    "node",
    "react",
    "java",
    "rust",
    "kotlin",
    "scala",
    "swift",
    "django",
    "rails",
    "devops",
    "frontend",
    "backend",
    "fullstack",
  ].map((s) => s.toLowerCase()),
);

/** Single token that looks like a surname, not a job title. */
function looksLikeSingleSurnameToken(role: string): boolean {
  const t = role.trim();
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  const word = tokens[0] ?? "";
  const lower = word.toLowerCase();
  if (SINGLE_WORD_ROLE_ALLOW.has(lower)) return false;
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ]+$/.test(word)) return false;
  if (word.length < 4 || word.length > 22) return false;
  if (ROLE_HINT.test(word)) return false;
  return true;
}

function toRoleDisplayCase(role: string): string {
  const t = role.trim();
  if (!t) return "";
  const tokens = t.split(/\s+/).filter(Boolean);
  const allCaps =
    tokens.length > 0 &&
    tokens.every((w) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]*$/.test(w) || /^[A-Z0-9.+]{2,6}$/.test(w));
  if (allCaps && tokens.length > 1) {
    return tokens
      .map((w) => {
        if (/^[A-Z0-9]{2,6}$/.test(w)) return w;
        const lower = w.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Clean job title: reject names/garbage → FALLBACK_ROLE; else display case.
 */
export function normalizeJobTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^por\s+definir$/i.test(trimmed)) return "Por definir";
  if (looksInvalidRole(trimmed) || looksLikeSingleSurnameToken(trimmed)) {
    return FALLBACK_ROLE;
  }
  return toRoleDisplayCase(trimmed).slice(0, 120);
}

export type ProfileFieldsToNormalize = {
  target_role: string;
  current_title: string;
  skills: string;
  tools: string;
  industries?: string;
  specializations?: string;
};

/**
 * Apply normalization to merged parse profile (mutates a shallow copy).
 */
export function normalizeParsedProfileData<T extends ProfileFieldsToNormalize>(data: T): T {
  const skillsNorm = mergeAndNormalizeSkills(data.skills, data.tools);

  const industryParts = splitCsvLoose(typeof data.industries === "string" ? data.industries : "")
    .map(normalizeIndustryCsvToken)
    .filter(Boolean);
  const specParts = splitCsvLoose(
    typeof data.specializations === "string" ? data.specializations : "",
  )
    .map(normalizeSpecCsvToken)
    .filter(Boolean);

  const trRaw = typeof data.target_role === "string" ? data.target_role : "";
  const ctRaw = typeof data.current_title === "string" ? data.current_title : "";

  const fromTarget = extractRoleIndustriesSpecializations(trRaw);
  industryParts.push(...fromTarget.industries);
  specParts.push(...fromTarget.specializations);

  const roleForTarget = fromTarget.role.trim() || trRaw.trim();

  let roleForCurrent: string;
  if (ctRaw.includes("|")) {
    const fromCurrent = extractRoleIndustriesSpecializations(ctRaw);
    industryParts.push(...fromCurrent.industries);
    specParts.push(...fromCurrent.specializations);
    roleForCurrent = fromCurrent.role.trim() || ctRaw.trim();
  } else {
    roleForCurrent = ctRaw.trim();
  }

  let target_role = normalizeJobTitle(roleForTarget);
  let current_title = normalizeJobTitle(roleForCurrent);

  if (!target_role.trim() && current_title.trim()) {
    target_role = current_title;
  }
  if (!current_title.trim() && target_role.trim()) {
    current_title = target_role;
  }

  const industries = mergeDedupedCsv(industryParts);
  const specializations = mergeDedupedCsv(specParts);

  return {
    ...data,
    skills: skillsNorm,
    tools: "",
    target_role,
    current_title,
    industries,
    specializations,
  };
}
