import { NextResponse } from "next/server";
import { requireCandidateLifecycleApi } from "@/lib/auth/apiRbac";
import {
  buildCandidateProfilesUpsertRow,
  CANDIDATE_PROFILES_WRITABLE_KEYS,
  type CandidateProfilesUpsertRow,
} from "@/lib/candidate/candidateProfilesWritePayload";
import {
  validateOnboardingProfilePayload,
  type OnboardingProfilePayload,
} from "@/lib/candidate/onboardingPayload";

export const runtime = "nodejs";

const LOG_PREFIX = "[onboarding-save]";
const IS_DEV = process.env.NODE_ENV !== "production";

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

function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const message = String((err as { message?: string }).message ?? "");
  return code === "42703" || /column .* does not exist/i.test(message);
}

async function upsertCandidateProfileWithFallback(
  supabase: any,
  row: CandidateProfilesUpsertRow,
) {
  const primary = await supabase
    .from("candidate_profiles")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (!primary.error || !isUndefinedColumnError(primary.error)) {
    return primary;
  }

  console.warn(LOG_PREFIX, "schema drift fallback for candidate_profiles", {
    message: primary.error.message,
    details: primary.error.details,
    hint: primary.error.hint,
    code: primary.error.code,
  });

  const { summary: _summary, industries: _industries, ...legacyRow } = row;
  return supabase
    .from("candidate_profiles")
    .upsert(legacyRow, { onConflict: "id" })
    .select("id")
    .maybeSingle();
}

export async function POST(request: Request) {
  let rawBody: unknown = null;

  try {
    const gate = await requireCandidateLifecycleApi();
    if (gate instanceof NextResponse) return gate;

    const { supabase, userId, email: sessionEmailFromAuth } = gate;
    console.info(LOG_PREFIX, "auth session resolved", {
      userId,
      authEmail: sessionEmailFromAuth ?? null,
      dbRole: gate.dbRole,
      effectiveRole: gate.effectiveRole,
    });

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
    if (IS_DEV) {
      console.info(LOG_PREFIX, "incoming payload", body);
    }

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

    const sessionEmail = sessionEmailFromAuth?.trim() || row.email;
    const upsertRow = buildCandidateProfilesUpsertRow(userId, {
      ...row,
      email: sessionEmail,
    });

    console.info(LOG_PREFIX, "pre-db", {
      userId,
      userEmail: sessionEmailFromAuth ?? null,
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
          id: userId,
          email: sessionEmail,
          role: "candidate",
        },
        { onConflict: "id" },
      );

      if (profileRoleError) {
        logSupabaseError("profiles upsert", profileRoleError);
        const reason = profileRoleError.message || "Error de base de datos.";
        return NextResponse.json(
          {
            success: false,
            error: reason,
            reason,
            code: profileRoleError.code,
          },
          { status: 500 },
        );
      }

      const upsertResult = await upsertCandidateProfileWithFallback(
        supabase,
        upsertRow,
      );

      if (upsertResult.error) {
        logSupabaseError("candidate_profiles upsert", upsertResult.error);
        const pg = upsertResult.error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };
        const reason = pg.message ?? "Error de base de datos.";
        return NextResponse.json(
          {
            success: false,
            error: reason,
            reason,
            code: pg.code,
          },
          { status: 500 },
        );
      }

      const savedId = upsertResult.data?.id ?? userId;

      if (!upsertResult.data?.id) {
        console.warn(
          LOG_PREFIX,
          "upsert ok but select returned no row (check RLS SELECT policies); assuming id = auth user",
          { userId },
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
          error: message,
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
