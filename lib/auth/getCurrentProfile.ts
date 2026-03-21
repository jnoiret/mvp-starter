import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

export function isCandidateAreaAllowed(role: string | null | undefined): boolean {
  return role === "candidate" || role === "admin";
}

export function isRecruiterAreaAllowed(role: string | null | undefined): boolean {
  return role === "recruiter" || role === "admin";
}
