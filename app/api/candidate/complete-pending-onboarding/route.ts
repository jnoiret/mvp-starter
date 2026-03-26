import { NextResponse } from "next/server";
import { requireCandidateLifecycleApi } from "@/lib/auth/apiRbac";
import {
  buildCandidateProfilesUpsertRow,
  type CandidateProfilesUpsertRow,
} from "@/lib/candidate/candidateProfilesWritePayload";
import {
  validateOnboardingProfilePayload,
  type OnboardingProfilePayload,
} from "@/lib/candidate/onboardingPayload";

export const runtime = "nodejs";
const LOG_PREFIX = "[complete-pending-onboarding]";
const IS_DEV = process.env.NODE_ENV !== "production";

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

/**
 * After magic link: assign candidate role + persist profile from localStorage draft.
 */
export async function POST(request: Request) {
  let rawBody: unknown = null;
  try {
    const gate = await requireCandidateLifecycleApi();
    if (gate instanceof NextResponse) return gate;

    const { supabase, userId, email: authEmail } = gate;
    console.info(LOG_PREFIX, "auth session resolved", {
      userId,
      authEmail: authEmail ?? null,
      dbRole: gate.dbRole,
      effectiveRole: gate.effectiveRole,
    });

    if (!authEmail?.trim()) {
      return NextResponse.json(
        { success: false, error: "Sesión no válida." },
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

    const body = rawBody as Record<string, unknown>;
    if (IS_DEV) {
      console.info(LOG_PREFIX, "incoming body", body);
    }

    const sessionEmail = authEmail.trim();
    const row: OnboardingProfilePayload = {
      full_name: String(body.full_name ?? "").trim(),
      email: sessionEmail,
      whatsapp: String(body.whatsapp ?? "").trim(),
      city: String(body.city ?? "").trim(),
      target_role: String(body.target_role ?? "").trim(),
      years_experience: Math.round(Number(body.years_experience)),
      skills: String(body.skills ?? "").trim(),
      expected_salary: Math.round(Number(body.expected_salary)),
      work_mode: String(body.work_mode ?? "").trim(),
      cv_url: String(body.cv_url ?? "").trim(),
      summary: String(body.summary ?? "").trim(),
      industries: String(body.industries ?? "").trim(),
    };

    const validationError = validateOnboardingProfilePayload(row);
    if (validationError) {
      console.info(LOG_PREFIX, "payload validation failed", { validationError });
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const { error: profileUpsertError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: sessionEmail,
        role: "candidate",
      },
      { onConflict: "id" },
    );

    if (profileUpsertError) {
      console.error(LOG_PREFIX, "profiles upsert failed", {
        message: profileUpsertError.message,
        details: profileUpsertError.details,
        hint: profileUpsertError.hint,
        code: profileUpsertError.code,
      });
      const reason = profileUpsertError.message || "Error de base de datos.";
      return NextResponse.json(
        {
          success: false,
          error: reason,
          reason,
          code: profileUpsertError.code,
        },
        { status: 500 },
      );
    }

    const upsertRow = buildCandidateProfilesUpsertRow(userId, {
      ...row,
      email: sessionEmail,
    });
    console.info(LOG_PREFIX, "candidate_profiles upsert payload", upsertRow);

    const upsertResult = await upsertCandidateProfileWithFallback(
      supabase,
      upsertRow,
    );

    if (upsertResult.error) {
      const e = upsertResult.error as { message?: string; code?: string; details?: string; hint?: string };
      console.error(LOG_PREFIX, "candidate_profiles upsert failed", {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      });
      const reason = upsertResult.error.message || "Error de base de datos.";
      return NextResponse.json(
        {
          success: false,
          error: reason,
          reason,
          code: e.code,
        },
        { status: 500 },
      );
    }

    const savedId = upsertResult.data?.id ?? userId;
    if (!upsertResult.data?.id) {
      console.warn(
        `${LOG_PREFIX} upsert ok but select returned no row (check RLS)`,
        { userId },
      );
    }

    return NextResponse.json(
      { success: true, data: { id: savedId ?? userId } },
      { status: 200 },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(LOG_PREFIX, "unexpected", {
      reason,
      rawBody,
      stack: err instanceof Error ? err.stack : null,
    });
    return NextResponse.json(
      { success: false, error: "Error inesperado.", reason },
      { status: 500 },
    );
  }
}
