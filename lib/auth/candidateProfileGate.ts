import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * True when the user is a candidate but has no candidate_profiles row (RLS-scoped).
 */
export async function candidateMissingExtendedProfile(): Promise<boolean> {
  const { user, profile } = await getCurrentProfile();
  if (!user || profile?.role !== "candidate") return false;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[candidateProfileGate]", error.message);
    return false;
  }
  return !data?.id;
}
