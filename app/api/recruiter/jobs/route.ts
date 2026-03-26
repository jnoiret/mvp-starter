import { NextResponse } from "next/server";
import { requireRecruiterFeatureApi } from "@/lib/auth/apiRbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateRecruiterJobPayload = {
  job_title: string;
  company: string;
  description: string;
  seniority: "junior" | "mid" | "senior" | "lead" | "director";
  industry: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asSeniority(
  value: unknown
): "junior" | "mid" | "senior" | "lead" | "director" | null {
  if (typeof value !== "string") return null;
  if (
    value === "junior" ||
    value === "mid" ||
    value === "senior" ||
    value === "lead" ||
    value === "director"
  ) {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  let payload: Partial<CreateRecruiterJobPayload> | null = null;
  try {
    const auth = await requireRecruiterFeatureApi();
    if (auth instanceof NextResponse) return auth;
    const supabase = auth.supabase;

    console.info("[api/recruiter/jobs] auth ok", {
      userId: auth.userId,
      email: auth.email,
      dbRole: auth.dbRole,
      effectiveRole: auth.effectiveRole,
    });

    try {
      payload = (await request.json()) as Partial<CreateRecruiterJobPayload>;
    } catch (parseErr) {
      const reason =
        parseErr instanceof Error ? `${parseErr.name}: ${parseErr.message}` : String(parseErr);
      console.warn("[api/recruiter/jobs] invalid JSON body", { reason });
      return NextResponse.json(
        { success: false, error: "Solicitud inválida: JSON incorrecto." },
        { status: 400 },
      );
    }

    console.info("[api/recruiter/jobs] request body", {
      payload,
    });

    const job_title = asString(payload.job_title);
    const company = asString(payload.company);
    const description = asString(payload.description);
    const seniority = asSeniority(payload.seniority);
    const industry = asString(payload.industry);

    if (!job_title || !company || !description || !seniority) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Completa los campos obligatorios: puesto, empresa, descripcion y seniority.",
        },
        { status: 400 }
      );
    }

    const targetTable = "recruiter_jobs";
    const insertPayload = {
      job_title,
      company,
      description,
      seniority,
      industry: industry || null,
    };

    console.info("[api/recruiter/jobs] insert start", {
      target_table: targetTable,
      insert_payload: insertPayload,
    });

    const { data, error } = await supabase
      .from(targetTable)
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("[api/recruiter/jobs] insert failed", {
        target_table: targetTable,
        insert_payload: insertPayload,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        {
          success: false,
          error: isDev
            ? `No se pudo crear la vacante: ${error.message}`
            : "No se pudo crear la vacante en este momento.",
          ...(isDev
            ? {
                debug: {
                  message: error.message,
                  details: error.details,
                  hint: error.hint,
                  code: error.code,
                },
              }
            : null),
        },
        { status: 500 }
      );
    }

    console.info("[api/recruiter/jobs] insert success", {
      target_table: targetTable,
      payload: insertPayload,
      result: data,
    });

    return NextResponse.json({
      success: true,
      id: String(data?.id ?? ""),
    });
  } catch (err) {
    const reason =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[api/recruiter/jobs] unexpected error", {
      reason,
      stack: err instanceof Error ? err.stack : null,
      payload,
    });
    return NextResponse.json(
      {
        success: false,
        error: isDev
          ? `Error inesperado al crear la vacante: ${reason}`
          : "Error inesperado al crear la vacante.",
        ...(isDev ? { debug: { reason } } : null),
      },
      { status: 500 }
    );
  }
}
