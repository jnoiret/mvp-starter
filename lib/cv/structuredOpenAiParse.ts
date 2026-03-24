/**
 * Server-only OpenAI structured extraction from CV plain text.
 * PDF/DOCX binaries are converted to text before calling this module.
 */

export type CvStructuredProfile = {
  full_name: string;
  summary: string;
  target_role: string;
  years_experience: number;
  skills: string[];
  city: string;
  whatsapp: string;
  expected_salary: string;
};

const STRUCTURED_SCHEMA = {
  name: "cv_onboarding_profile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "full_name",
      "summary",
      "target_role",
      "years_experience",
      "skills",
      "city",
      "whatsapp",
      "expected_salary",
    ],
    properties: {
      full_name: { type: "string" },
      summary: { type: "string", maxLength: 900 },
      target_role: { type: "string" },
      years_experience: { type: "number" },
      skills: {
        type: "array",
        items: { type: "string" },
        maxItems: 35,
      },
      city: { type: "string" },
      whatsapp: { type: "string" },
      expected_salary: { type: "string" },
    },
  },
} as const;

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeStringList(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= max) break;
  }
  return result;
}

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Normalize model output to safe onboarding values. */
export function sanitizeStructuredCvProfile(input: unknown): CvStructuredProfile {
  const obj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const years = Math.max(0, Math.min(60, Math.round(toSafeNumber(obj.years_experience))));
  const salaryDigits = toSafeString(obj.expected_salary).replace(/\D/g, "");

  let summary = toSafeString(obj.summary);
  if (summary.length > 800) summary = `${summary.slice(0, 797)}…`;

  return {
    full_name: toSafeString(obj.full_name).slice(0, 120),
    summary,
    target_role: toSafeString(obj.target_role).slice(0, 120),
    years_experience: years,
    skills: toSafeStringList(obj.skills, 35),
    city: toSafeString(obj.city).slice(0, 120),
    whatsapp: toSafeString(obj.whatsapp).replace(/\D/g, "").slice(0, 15),
    expected_salary: salaryDigits.slice(0, 12),
  };
}

const SYSTEM_PROMPT = [
  "You extract structured data from CV/resume text for a job platform.",
  "Rules:",
  "- Output must follow the JSON schema exactly.",
  "- Do not invent employers, dates, degrees, or skills that are not clearly supported by the text.",
  "- If information is missing or uncertain, use empty string \"\", empty array [], or 0 for years_experience.",
  "",
  "Field: summary (critical)",
  "- Map ALL of the following section titles (and close variants, any language) into the single JSON field `summary`:",
  '  "Profile", "Professional Profile", "Summary", "Professional Summary", "Career Summary", "Executive Summary",',
  '  "About", "About me", "About Me", "Objective", "Career Objective", "Professional Objective", "Overview", "Presentation".',
  "- Under any such heading, extract the FULL contiguous paragraph(s) or bullet block that belong to that section (not the next section).",
  "- If several of these sections appear, choose ONE text for `summary`: pick the longest or most substantive / descriptive block (prioritize rich prose over a one-line tagline).",
  "- If none of those headings exist but an opening paragraph clearly describes the candidate (who they are, what they do), use that prose as `summary`.",
  "- Never leave `summary` empty when the CV clearly contains qualifying content under any mapping above or an equivalent opening profile paragraph.",
  "- Format `summary` as 2–4 short lines or sentences (concise), same language as the CV (or Spanish if the document is mixed).",
  "- Only if there is truly no profile-like prose anywhere, you may synthesize a brief 2–3 sentence summary strictly from roles, skills, and years visible in the CV; if even that context is insufficient, use \"\".",
  "",
  "- target_role: job title only (e.g. \"Senior Product Manager\"). Do not append industries, verticals, or product descriptors; use \"\" if unclear.",
  "- skills: technical and professional skills mentioned; no fluff.",
  "- whatsapp: phone suitable for WhatsApp; digits and optional leading + only; \"\" if not found.",
  "- expected_salary: numeric digits only (monthly or annual as written in CV); \"\" if not stated.",
  "- city: city or region of residence if stated; \"\" otherwise.",
].join("\n");

const USER_PROMPT_PREFIX =
  "Extract structured fields from this CV text. For `summary`, merge section headings such as Profile, Summary, Professional Summary, and About into one concise 2–4 line summary as instructed.\n\n";

export type StructuredParseLogContext = {
  log: (step: string, data: Record<string, unknown>) => void;
};

/**
 * Calls OpenAI Chat Completions with JSON schema. Returns null if key missing or API failure.
 */
export async function extractStructuredProfileWithOpenAI(
  cvPlainText: string,
  ctx?: StructuredParseLogContext,
): Promise<CvStructuredProfile | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    ctx?.log("openai_structured_skipped", { reason: "OPENAI_API_KEY unset" });
    return null;
  }

  const text = cvPlainText.slice(0, 24_000);
  ctx?.log("openai_structured_request", { cvTextLength: text.length, model: "gpt-4o-mini" });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.05,
      response_format: {
        type: "json_schema",
        json_schema: STRUCTURED_SCHEMA,
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${USER_PROMPT_PREFIX}${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    ctx?.log("openai_structured_http_error", {
      status: response.status,
      bodyPreview: errBody.slice(0, 400),
    });
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    ctx?.log("openai_structured_empty_content", {});
    return null;
  }

  try {
    const raw = JSON.parse(content) as unknown;
    const sanitized = sanitizeStructuredCvProfile(raw);
    ctx?.log("openai_structured_success", {
      hasName: Boolean(sanitized.full_name),
      skillsCount: sanitized.skills.length,
      summaryLen: sanitized.summary.length,
      years: sanitized.years_experience,
      hasCity: Boolean(sanitized.city),
      hasWhatsapp: Boolean(sanitized.whatsapp),
      hasSalary: Boolean(sanitized.expected_salary),
    });
    return sanitized;
  } catch (e) {
    ctx?.log("openai_structured_json_error", {
      preview: content.slice(0, 200),
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** True if structured extraction has enough signal to treat OpenAI as having worked. */
export function structuredProfileHasCoreData(s: CvStructuredProfile): boolean {
  return (
    s.full_name.length > 2 ||
    s.target_role.length > 2 ||
    s.skills.length > 0 ||
    s.summary.length > 20 ||
    s.years_experience > 0
  );
}
