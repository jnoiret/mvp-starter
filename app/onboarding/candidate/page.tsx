import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CandidateQuickOnboarding } from "@/components/onboarding/CandidateQuickOnboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingCandidatePage() {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "candidate") redirect("/auth/redirect");

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("candidate_profiles")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (data?.id) redirect("/candidate/jobs");

  const meta = user.user_metadata as { full_name?: string } | undefined;
  const defaultName =
    typeof meta?.full_name === "string" ? meta.full_name : "";

  return (
    <CandidateQuickOnboarding
      variant="authenticated"
      defaultEmail={user.email ?? ""}
      defaultName={defaultName}
    />
  );
}
