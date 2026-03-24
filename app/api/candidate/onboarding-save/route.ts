import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildCandidateProfilesUpsertRow,
  CANDIDATE_PROFILES_WRITABLE_KEYS,
} from "@/lib/candidate/candidateProfilesWritePayload";
import {
  validateOnboardingProfilePayload,
  type OnboardingProfilePayload,
} from "@/lib/candidate/onboardingPayload";

export const runtime = "nodejs";

const LOG_PREFIX = "[onboarding-save]";

type Body = Partial<OnboardingProfilePayload>;

function logSupabaseError(context: string, err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    console.error(LOG_PREFIX, context, {
      message: e.message,
      details: e.details,
      hint: e.hint,
      code: e.code,
    });
  } else {
    console.error(LOG_PREFIX, context, err);
  }
  if (err instanceof Error && err.stack) {
    console.error(LOG_PREFIX, `${context} stack`, err.stack);
  }
}

export async function POST(request: Request) {
  let rawBody: unknown = null;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.warn(LOG_PREFIX, "auth.getUser error", {
        message: authError.message,
        name: authError.name,
      });
    }

    if (!user?.id) {
      console.info(LOG_PREFIX, "no session — client should keep draft until login", {
        authError: authError?.message ?? null,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Necesitas iniciar sesión para guardar el perfil en el servidor. Tu borrador sigue en este dispositivo hasta que completes el acceso.",
          code: "NOT_AUTHENTICATED",
        },
        { status: 401 },
      );
    }

    try {
      rawBody = await request.json();
    } catch (parseErr) {
      console.error(LOG_PREFIX, "invalid JSON body", parseErr);
      return NextResponse.json(
        { success: false, error: "Solicitud inválida: JSON incorrecto." },
        { status: 400 },
      );
    }

    const body = rawBody as Body;

    const yearsRaw = Number(body.years_experience);
    const salaryRaw = Number(body.expected_salary);

    const row: OnboardingProfilePayload = {
      full_name: String(body.full_name ?? "").trim(),
      email: String(body.email ?? "").trim(),
      whatsapp: String(body.whatsapp ?? "").trim(),
      city: String(body.city ?? "").trim(),
      target_role: String(body.target_role ?? "").trim(),
      years_experience: Math.round(Number.isFinite(yearsRaw) ? yearsRaw : NaN),
      skills: String(body.skills ?? "").trim(),
      expected_salary: Math.round(Number.isFinite(salaryRaw) ? salaryRaw : NaN),
      work_mode: String(body.work_mode ?? "").trim(),
      cv_url: String(body.cv_url ?? "").trim(),
      summary: String(body.summary ?? "").trim(),
      industries: String(body.industries ?? "").trim(),
    };

    const validationError = validateOnboardingProfilePayload(row);
    if (validationError) {
      console.info(LOG_PREFIX, "validation failed", { validationError, rowPreview: { ...row, skills: row.skills.slice(0, 80) } });
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const sessionEmail = user.email?.trim() || row.email;
    const upsertRow = buildCandidateProfilesUpsertRow(user.id, {
      ...row,
      email: sessionEmail,
    });

    console.info(LOG_PREFIX, "pre-db", {
      userId: user.id,
      userEmail: user.email ?? null,
      writableKeys: [...CANDIDATE_PROFILES_WRITABLE_KEYS],
      parsedFields: {
        ...upsertRow,
        skills: upsertRow.skills.length > 100 ? `${upsertRow.skills.slice(0, 100)}…` : upsertRow.skills,
      },
    });

    console.info(LOG_PREFIX, "supabase candidate_profiles upsert payload", upsertRow);

    try {
      const { error: profileRoleError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: sessionEmail,
          role: "candidate",
        },
        { onConflict: "id" },
      );

      if (profileRoleError) {
        logSupabaseError("profiles upsert", profileRoleError);
        return NextResponse.json(
          {
            success: false,
            error: "No se pudo preparar tu cuenta de candidato.",
            reason: profileRoleError.message,
          },
          { status: 500 },
        );
      }

      const upsertResult = await supabase
        .from("candidate_profiles")
        .upsert(upsertRow, { onConflict: "id" })
        .select("id")
        .maybeSingle();

      if (upsertResult.error) {
        logSupabaseError("candidate_profiles upsert", upsertResult.error);
        const pg = upsertResult.error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };
        return NextResponse.json(
          {
            success: false,
            error: "No se pudo guardar tu perfil.",
            reason: pg.message ?? "Error de base de datos.",
            code: pg.code,
          },
          { status: 500 },
        );
      }

      const savedId = upsertResult.data?.id ?? user.id;

      if (!upsertResult.data?.id) {
        console.warn(
          LOG_PREFIX,
          "upsert ok but select returned no row (check RLS SELECT policies); assuming id = auth user",
          { userId: user.id },
        );
      }

      console.info(LOG_PREFIX, "success", { savedId });

      return NextResponse.json(
        { success: true, data: { id: savedId } },
        { status: 200 },
      );
    } catch (dbErr) {
      logSupabaseError("database write try/catch", dbErr);
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar tu perfil.",
          reason: message,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    logSupabaseError("unexpected outer", err);
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: "Error inesperado al guardar.", reason },
      { status: 500 },
    );
  }
}
