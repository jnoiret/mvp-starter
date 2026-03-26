import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessCandidateRoutes, canAccessRecruiterRoutes } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";

export type ProfileRole = "candidate" | "recruiter" | "admin";

export type ProfileRow = {
  id: string;
  email: string | null;
  role: string;
};

export type CurrentProfileResult = {
  user: User | null;
  profile: ProfileRow | null;
};

/**
 * Server-only: current Supabase auth user + matching row from public.profiles.
 */
export async function getCurrentProfile(): Promise<CurrentProfileResult> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { user, profile: null };
  }

  return {
    user,
    profile: profile as ProfileRow,
  };
}

/** Pass effective role from {@link resolveAppRole} (or equivalent string). */
export function isCandidateAreaAllowed(
  role: string | null | undefined | AppRole,
): boolean {
  return canAccessCandidateRoutes((role as AppRole) ?? null);
}

export function isRecruiterAreaAllowed(
  role: string | null | undefined | AppRole,
): boolean {
  return canAccessRecruiterRoutes((role as AppRole) ?? null);
}
