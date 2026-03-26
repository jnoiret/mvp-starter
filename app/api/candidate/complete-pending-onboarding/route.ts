import { NextResponse } from "next/server";
import { requireCandidateLifecycleApi } from "@/lib/auth/apiRbac";
import { buildCandidateProfilesUpsertRow } from "@/lib/candidate/candidateProfilesWritePayload";
import {
  validateOnboardingProfilePayload,
  type OnboardingProfilePayload,
} from "@/lib/candidate/onboardingPayload";

export const runtime = "nodejs";

/**
 * After magic link: assign candidate role + persist profile from localStorage draft.
 */
export async function POST(request: Request) {
  try {
    const gate = await requireCandidateLifecycleApi();
    if (gate instanceof NextResponse) return gate;

    const { supabase, userId, email: authEmail } = gate;
    if (!authEmail?.trim()) {
      return NextResponse.json(
        { success: false, error: "Sesión no válida." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

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
      console.error("[complete-pending-onboarding] profiles", profileUpsertError);
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo activar tu cuenta de candidato.",
          reason: profileUpsertError.message,
        },
        { status: 500 },
      );
    }

    const upsertRow = buildCandidateProfilesUpsertRow(userId, {
      ...row,
      email: sessionEmail,
    });

    const upsertResult = await supabase
      .from("candidate_profiles")
      .upsert(upsertRow, { onConflict: "id" })
      .select("id")
      .maybeSingle();

    if (upsertResult.error) {
      const e = upsertResult.error as { message?: string; code?: string; details?: string; hint?: string };
      console.error("[complete-pending-onboarding] candidate_profiles upsert", {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      });
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar tu perfil.",
          reason: upsertResult.error.message,
          code: e.code,
        },
        { status: 500 },
      );
    }

    const savedId = upsertResult.data?.id ?? userId;
    if (!upsertResult.data?.id) {
      console.warn(
        "[complete-pending-onboarding] upsert ok but select returned no row (check RLS)",
        { userId },
      );
    }

    return NextResponse.json(
      { success: true, data: { id: savedId ?? userId } },
      { status: 200 },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[complete-pending-onboarding] unexpected", err);
    return NextResponse.json(
      { success: false, error: "Error inesperado.", reason },
      { status: 500 },
    );
  }
}
