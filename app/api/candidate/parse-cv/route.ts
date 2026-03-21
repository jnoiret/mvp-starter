import { NextResponse } from "next/server";
import { PdfReader } from "pdfreader";
import mammoth from "mammoth";
import type { WorkMode } from "@/components/candidate/onboarding/types";

export const runtime = "nodejs";

type ParsedProfile = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  city: string;
  current_title: string;
  target_role: string;
  seniority:
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "director"
    | "executive"
    | "unknown"
    | "";
  years_experience: string;
  skills: string;
  tools: string;
  industries: string;
  languages: string;
  education: string;
  summary: string;
  expected_salary: string;
  work_mode: WorkMode | "";
};

type AiExtractedProfile = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  target_role: string;
  seniority:
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "director"
    | "executive"
    | "unknown";
  years_experience: number;
  skills: string[];
  tools: string[];
  industries: string[];
  languages: string[];
  education: string[];
  summary: string;
  confidence_notes: string[];
};

type ParsedProfileResponse = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  target_role: string;
  seniority:
    | "junior"
    | "mid"
    | "senior"
    | "lead"
    | "director"
    | "executive"
    | "unknown";
  years_experience: number;
  skills: string[];
  tools: string[];
  industries: string[];
  languages: string[];
  education: string[];
  summary: string;
  confidence_notes: string[];
};

function emptyProfile(): ParsedProfile {
  return {
    full_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    location: "",
    city: "",
    current_title: "",
    target_role: "",
    seniority: "",
    years_experience: "",
    skills: "",
    tools: "",
    industries: "",
    languages: "",
    education: "",
    summary: "",
    expected_salary: "",
    work_mode: "",
  };
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toSafeStringList(value: unknown) {
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
  }

  return result;
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toParsedProfileResponse(
  data: ParsedProfile,
  aiProfile: AiExtractedProfile | null
): ParsedProfileResponse {
  const seniority = data.seniority || aiProfile?.seniority || "unknown";
  const years = Number(data.years_experience);
  const yearsExperience = Number.isFinite(years)
    ? Math.max(0, Math.round(years))
    : 0;

  return {
    full_name: data.full_name,
    email: data.email,
    phone: data.phone || data.whatsapp,
    location: data.location || data.city,
    current_title: data.current_title,
    target_role: data.target_role,
    seniority:
      seniority === "junior" ||
      seniority === "mid" ||
      seniority === "senior" ||
      seniority === "lead" ||
      seniority === "director" ||
      seniority === "executive"
        ? seniority
        : "unknown",
    years_experience: yearsExperience,
    skills: aiProfile?.skills.length ? aiProfile.skills : splitCommaList(data.skills),
    tools: aiProfile?.tools.length ? aiProfile.tools : splitCommaList(data.tools),
    industries: aiProfile?.industries.length
      ? aiProfile.industries
      : splitCommaList(data.industries),
    languages: aiProfile?.languages.length
      ? aiProfile.languages
      : splitCommaList(data.languages),
    education: aiProfile?.education.length
      ? aiProfile.education
      : splitCommaList(data.education),
    summary: data.summary,
    confidence_notes: aiProfile?.confidence_notes ?? [],
  };
}

function sanitizeAiExtractedProfile(input: unknown): AiExtractedProfile {
  const obj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const seniorityRaw = toSafeString(obj.seniority).toLowerCase();
  const seniorityValues = new Set([
    "junior",
    "mid",
    "senior",
    "lead",
    "director",
    "executive",
    "unknown",
  ]);

  const seniority = seniorityValues.has(seniorityRaw)
    ? (seniorityRaw as AiExtractedProfile["seniority"])
    : "unknown";

  return {
    full_name: toSafeString(obj.full_name),
    email: toSafeString(obj.email),
    phone: toSafeString(obj.phone),
    location: toSafeString(obj.location),
    current_title: toSafeString(obj.current_title),
    target_role: toSafeString(obj.target_role),
    seniority,
    years_experience: Math.max(
      0,
      Math.min(60, Math.round(toSafeNumber(obj.years_experience)))
    ),
    skills: toSafeStringList(obj.skills).slice(0, 25),
    tools: toSafeStringList(obj.tools).slice(0, 25),
    industries: toSafeStringList(obj.industries).slice(0, 10),
    languages: toSafeStringList(obj.languages).slice(0, 10),
    education: toSafeStringList(obj.education).slice(0, 10),
    summary: toSafeString(obj.summary),
    confidence_notes: toSafeStringList(obj.confidence_notes).slice(0, 10),
  };
}

function mergeAiToParsedProfile(ai: AiExtractedProfile): ParsedProfile {
  return {
    full_name: ai.full_name,
    email: ai.email,
    phone: ai.phone,
    whatsapp: ai.phone,
    location: ai.location,
    city: ai.location,
    current_title: ai.current_title,
    target_role: ai.target_role || ai.current_title,
    seniority: ai.seniority,
    years_experience: ai.years_experience > 0 ? String(ai.years_experience) : "",
    skills: ai.skills.slice(0, 12).join(", "),
    tools: ai.tools.slice(0, 12).join(", "),
    industries: ai.industries.slice(0, 8).join(", "),
    languages: ai.languages.slice(0, 8).join(", "),
    education: ai.education.slice(0, 8).join(", "),
    summary: ai.summary,
    expected_salary: "",
    work_mode: "",
  };
}

function firstMatch(regex: RegExp, text: string, group = 1) {
  const match = text.match(regex);
  return match?.[group]?.trim() ?? "";
}

function inferEmail(text: string) {
  return firstMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, text, 0);
}

function inferWhatsapp(text: string) {
  const match = text.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g);
  if (!match?.length) return "";
  const best = match.find((item) => item.replace(/[^\d]/g, "").length >= 8) ?? "";
  return best.trim();
}

function inferWorkMode(text: string): WorkMode | "" {
  const lower = text.toLowerCase();
  if (/\bh[ií]brido\b/.test(lower)) return "hibrido";
  if (/\bremoto\b/.test(lower) || /\bhome office\b/.test(lower)) return "remoto";
  if (/\bpresencial\b/.test(lower)) return "presencial";
  if (/\bindiferente\b/.test(lower) || /\bflexible\b/.test(lower)) {
    return "indiferente";
  }
  return "";
}

function inferYearsExperience(text: string) {
  const direct = firstMatch(
    /(\d{1,2})\+?\s*(?:a[nñ]os?|years?|yrs?)\s+(?:de\s+)?experiencia/i,
    text
  );
  if (direct) return direct;

  return firstMatch(
    /experiencia\s*(?:total)?\s*[:\-]?\s*(\d{1,2})\s*(?:a[nñ]os?|years?|yrs?)/i,
    text
  );
}

function inferExpectedSalary(text: string) {
  const value = firstMatch(
    /(?:salario\s*(?:esperado|pretendido)?|pretensiones?\s+salariales?|expected\s+salary)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    text
  );
  return value.replace(/[^\d]/g, "");
}

function inferCity(text: string) {
  return firstMatch(
    /(?:ciudad|ubicaci[oó]n|location|residencia)\s*[:\-]\s*([^\n,;|]+)/i,
    text
  );
}

function inferTargetRole(text: string, lines: string[]) {
  const labeled = firstMatch(
    /(?:puesto|rol|cargo|position|title|objetivo\s+profesional)\s*[:\-]\s*([^\n|]+)/i,
    text
  );
  if (labeled) return labeled;

  const roleCandidates = lines
    .slice(0, 12)
    .filter((line) => line.length > 3 && line.length < 60)
    .filter(
      (line) =>
        !/@/.test(line) &&
        !/\d{7,}/.test(line) &&
        !/(curriculum|resume|cv|tel[eé]fono|email|correo)/i.test(line)
    );

  return roleCandidates[1] ?? "";
}

function inferFullName(lines: string[]) {
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    if (cleaned.length < 4 || cleaned.length > 70) continue;
    if (/@/.test(cleaned) || /\d/.test(cleaned)) continue;
    if (
      /(curriculum|resume|cv|perfil|contacto|email|correo|tel[eé]fono)/i.test(
        cleaned
      )
    ) {
      continue;
    }

    const words = cleaned.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;

    return cleaned;
  }

  return "";
}

function inferSkills(text: string) {
  const block = firstMatch(
    /(?:habilidades|skills|competencias|tecnolog[ií]as)\s*[:\n-]\s*([\s\S]{0,250})/i,
    text
  );
  const source = block || firstMatch(/(?:stack|tools?)\s*[:\-]\s*([^\n]+)/i, text);
  if (!source) return "";

  const tokens = source
    .split(/[,|•·\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 30)
    .slice(0, 12);

  return tokens.join(", ");
}

function parseProfileFromText(text: string): ParsedProfile {
  const normalized = normalizeText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    full_name: inferFullName(lines),
    email: inferEmail(normalized),
    phone: inferWhatsapp(normalized),
    whatsapp: inferWhatsapp(normalized),
    location: inferCity(normalized),
    city: inferCity(normalized),
    current_title: inferTargetRole(normalized, lines),
    target_role: inferTargetRole(normalized, lines),
    seniority: "",
    years_experience: inferYearsExperience(normalized),
    skills: inferSkills(normalized),
    tools: "",
    industries: "",
    languages: "",
    education: "",
    summary: "",
    expected_salary: inferExpectedSalary(normalized),
    work_mode: inferWorkMode(normalized),
  };
}

async function parseProfileWithAi(text: string): Promise<AiExtractedProfile | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "You are extracting structured candidate profile data from a CV text.",
    "Return valid JSON only.",
    "Do not invent facts that are not reasonably supported.",
    "Infer target_role from recent experience if missing.",
    "Infer seniority conservatively.",
  ].join(" ");

  const schema = {
    name: "candidate_profile_extract",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "full_name",
        "email",
        "phone",
        "location",
        "current_title",
        "target_role",
        "seniority",
        "years_experience",
        "skills",
        "tools",
        "industries",
        "languages",
        "education",
        "summary",
        "confidence_notes",
      ],
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        current_title: { type: "string" },
        target_role: { type: "string" },
        seniority: {
          type: "string",
          enum: ["junior", "mid", "senior", "lead", "director", "executive", "unknown"],
        },
        years_experience: { type: "number" },
        skills: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string" } },
        industries: { type: "array", items: { type: "string" } },
        languages: { type: "array", items: { type: "string" } },
        education: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        confidence_notes: { type: "array", items: { type: "string" } },
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
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: schema,
      },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `CV text:\n${text.slice(0, 20000)}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return sanitizeAiExtractedProfile(JSON.parse(content));
  } catch {
    return null;
  }
}

function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    new PdfReader().parseBuffer(buffer, (error, item) => {
      if (error) {
        reject(error);
        return;
      }

      if (!item) {
        resolve(chunks.join("\n").trim());
        return;
      }

      if (item.text) {
        chunks.push(String(item.text));
      }
    });
  });
}

async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("cv");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió un archivo de CV." },
        { status: 400 }
      );
    }

    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");

    if (!isPdf && !isDocx) {
      return NextResponse.json(
        { error: "Formato no compatible. Usa un archivo PDF o DOCX." },
        { status: 400 }
      );
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "El archivo supera el tamaño máximo de 5 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    try {
      extractedText = isPdf
        ? await extractTextFromPdfBuffer(buffer)
        : await extractTextFromDocxBuffer(buffer);
    } catch (parseError) {
      const reason =
        parseError instanceof Error
          ? `${parseError.name}: ${parseError.message}`
          : String(parseError);

      return NextResponse.json(
        {
          success: true,
          parsed_profile: toParsedProfileResponse(emptyProfile(), null),
          data: emptyProfile(),
          meta: {
            extracted_characters: 0,
            scanned_pdf_fallback_attempted: false,
            scanned_pdf_fallback_used: false,
          },
          warning:
            "No pudimos analizar tu CV automáticamente. Puedes continuar y completar tu perfil manualmente.",
          reason,
        },
        { status: 200 }
      );
    }

    const extractedLength = extractedText.trim().length;

    if (extractedLength < 40) {
      return NextResponse.json(
        {
          success: true,
          parsed_profile: toParsedProfileResponse(emptyProfile(), null),
          data: emptyProfile(),
          meta: {
            extracted_characters: extractedLength,
            scanned_pdf_fallback_attempted: false,
            scanned_pdf_fallback_used: false,
          },
          warning: isPdf
            ? "No pudimos leer texto de este archivo. Parece ser un PDF escaneado o sin texto seleccionable. Prueba con un PDF exportado desde Word/Google Docs o sube un archivo DOCX."
            : "No encontramos suficiente texto en tu archivo. Puedes completar tu perfil manualmente.",
        },
        { status: 200 }
      );
    }

    let data = parseProfileFromText(extractedText);
    let aiProfile: AiExtractedProfile | null = null;
    let warning: string | null = null;

    try {
      aiProfile = await parseProfileWithAi(extractedText);

      if (aiProfile) {
        const aiMapped = mergeAiToParsedProfile(aiProfile);
        data = {
          ...data,
          full_name: aiMapped.full_name || data.full_name,
          email: aiMapped.email || data.email,
          phone: aiMapped.phone || data.phone,
          whatsapp: aiMapped.whatsapp || data.whatsapp,
          location: aiMapped.location || data.location,
          city: aiMapped.city || data.city,
          current_title: aiMapped.current_title || data.current_title,
          target_role: aiMapped.target_role || data.target_role,
          seniority: aiMapped.seniority || data.seniority,
          years_experience: aiMapped.years_experience || data.years_experience,
          skills: aiMapped.skills || data.skills,
          tools: aiMapped.tools || data.tools,
          industries: aiMapped.industries || data.industries,
          languages: aiMapped.languages || data.languages,
          education: aiMapped.education || data.education,
          summary: aiMapped.summary || data.summary,
        };
      } else {
        warning =
          "No pudimos completar todo automáticamente. Revisa y ajusta tus datos antes de continuar.";
      }
    } catch {
      warning =
        "No pudimos completar todo automáticamente. Revisa y ajusta tus datos antes de continuar.";
    }

    const parsedProfile = toParsedProfileResponse(data, aiProfile);

    return NextResponse.json(
      {
        success: true,
        parsed_profile: parsedProfile,
        data,
        meta: {
          extracted_characters: extractedLength,
          scanned_pdf_fallback_attempted: false,
          scanned_pdf_fallback_used: false,
        },
        warning,
        scanned_pdf_fallback_attempted: false,
        scanned_pdf_fallback_used: false,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("CV parse route error:", error);

    const reason =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);

    return NextResponse.json(
      { error: "No pudimos procesar el CV en este momento.", reason },
      { status: 500 }
    );
  }
}