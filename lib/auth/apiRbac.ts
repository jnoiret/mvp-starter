import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAdminRequester } from "@/lib/admin/assertAdminRequester";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/roles";
import {
  canAccessCandidateRoutes,
  canAccessRecruiterRoutes,
  canUseCandidateLifecycleApis,
  resolveAppRole,
} from "@/lib/auth/roles";

export type ApiSessionContext = {
  userId: string;
  email: string | null;
  dbRole: string | null;
  effectiveRole: AppRole | null;
  supabase: SupabaseClient;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

export function apiUnauthorized(message = "No autenticado.") {
  return NextResponse.json(
    { success: false, error: message, code: "UNAUTHORIZED" as const },
    { status: 401, headers: JSON_HEADERS },
  );
}

export function apiForbidden(message = "No autorizado.") {
  return NextResponse.json(
    { success: false, error: message, code: "FORBIDDEN" as const },
    { status: 403, headers: JSON_HEADERS },
  );
}

/**
 * Load session + profile; `effectiveRole` may be null while onboarding.
 */
export async function getApiSession(): Promise<
  { ok: true; ctx: ApiSessionContext } | { ok: false; response: NextResponse }
> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, response: apiUnauthorized() };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .maybeSingle();

  const email =
    user.email?.trim() ??
    (typeof profile?.email === "string" ? profile.email.trim() : null) ??
    null;
  const dbRole =
    typeof profile?.role === "string" ? profile.role.trim() : null;
  const effectiveRole = resolveAppRole(email, dbRole);

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email,
      dbRole,
      effectiveRole,
      supabase,
    },
  };
}

/** Candidate or admin (saved profile, job apply, match analysis, etc.). */
export async function requireCandidateFeatureApi(): Promise<
  ApiSessionContext | NextResponse
> {
  const r = await getApiSession();
  if (!r.ok) return r.response;
  if (!canAccessCandidateRoutes(r.ctx.effectiveRole)) {
    return apiForbidden("Se requiere perfil de candidato.");
  }
  return r.ctx;
}

/** Recruiter or admin. */
export async function requireRecruiterFeatureApi(): Promise<
  ApiSessionContext | NextResponse
> {
  const r = await getApiSession();
  if (!r.ok) return r.response;
  if (!canAccessRecruiterRoutes(r.ctx.effectiveRole)) {
    return apiForbidden("Se requiere cuenta de reclutador.");
  }
  return r.ctx;
}

/** Parse CV, onboarding-save, complete-pending: not recruiter-only. */
export async function requireCandidateLifecycleApi(): Promise<
  ApiSessionContext | NextResponse
> {
  const r = await getApiSession();
  if (!r.ok) return r.response;
  if (!canUseCandidateLifecycleApis(r.ctx.email, r.ctx.dbRole)) {
    return apiForbidden("Esta acción no está disponible para cuentas de reclutador.");
  }
  return r.ctx;
}

/**
 * Admin console APIs: allowlist + synced `profiles.role` (existing guard).
 */
export { assertAdminRequester as requireAdminApiAccess };
