import { NextResponse } from "next/server";
import { PdfReader } from "pdfreader";
import type { WorkMode } from "@/components/candidate/onboarding/types";

export const runtime = "nodejs";

type ParsedProfile = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: string;
  skills: string;
  expected_salary: string;
  work_mode: WorkMode | "";
};

function emptyProfile(): ParsedProfile {
  return {
    full_name: "",
    email: "",
    whatsapp: "",
    city: "",
    target_role: "",
    years_experience: "",
    skills: "",
    expected_salary: "",
    work_mode: "",
  };
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
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
  if (/\bindiferente\b/.test(lower) || /\bflexible\b/.test(lower)) return "indiferente";
  return "";
}

function inferYearsExperience(text: string) {
  const direct = firstMatch(
    /(\d{1,2})\+?\s*(?:a[nñ]os?|years?|yrs?)\s+(?:de\s+)?experiencia/i,
    text
  );
  if (direct) return direct;

  const alt = firstMatch(
    /experiencia\s*(?:total)?\s*[:\-]?\s*(\d{1,2})\s*(?:a[nñ]os?|years?|yrs?)/i,
    text
  );
  return alt;
}

function inferExpectedSalary(text: string) {
  const value = firstMatch(
    /(?:salario\s*(?:esperado|pretendido)?|pretensiones?\s+salariales?|expected\s+salary)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    text
  );
  return value.replace(/[^\d]/g, "");
}

function inferCity(text: string) {
  const city = firstMatch(
    /(?:ciudad|ubicaci[oó]n|location|residencia)\s*[:\-]\s*([^\n,;|]+)/i,
    text
  );
  return city;
}

function inferTargetRole(text: string, lines: string[]) {
  const labeled = firstMatch(
    /(?:puesto|rol|cargo|position|title|objetivo\s+profesional)\s*[:\-]\s*([^\n|]+)/i,
    text
  );
  if (labeled) return labeled;

  // Fallback: detect first short line that looks like a job title near top.
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
    if (/(curriculum|resume|cv|perfil|contacto|email|correo|tel[eé]fono)/i.test(cleaned))
      continue;
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
    whatsapp: inferWhatsapp(normalized),
    city: inferCity(normalized),
    target_role: inferTargetRole(normalized, lines),
    years_experience: inferYearsExperience(normalized),
    skills: inferSkills(normalized),
    expected_salary: inferExpectedSalary(normalized),
    work_mode: inferWorkMode(normalized),
  };
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

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Por ahora solo se soportan archivos PDF." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";
    try {
      extractedText = await extractTextFromPdfBuffer(buffer);
    } catch (parseError) {
      const reason =
        parseError instanceof Error
          ? `${parseError.name}: ${parseError.message}`
          : String(parseError);
      return NextResponse.json(
        {
          data: emptyProfile(),
          meta: { extracted_characters: 0 },
          warning: "No pudimos extraer texto del PDF. Puedes completar tus datos manualmente.",
          reason,
        },
        { status: 200 }
      );
    }

    if (!extractedText) {
      return NextResponse.json(
        {
          data: emptyProfile(),
          meta: { extracted_characters: 0 },
          warning:
            "No encontramos texto en el PDF. Asegúrate de que sea un PDF con texto seleccionable.",
        },
        { status: 200 }
      );
    }

    const data = parseProfileFromText(extractedText);
    return NextResponse.json({
      data,
      meta: { extracted_characters: extractedText.length },
    });
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

