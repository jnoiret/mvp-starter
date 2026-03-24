import { redirect } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RoleOnboardingForm } from "./RoleOnboardingForm";

export const dynamic = "force-dynamic";

async function hasCandidateProfileRow(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.id) && !error;
}

export default async function OnboardingRolePage() {
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect("/login");

  if (isAllowedAdminEmail(user.email ?? profile?.email)) {
    redirect("/auth/redirect");
  }

  const role = profile?.role;
  if (role === "recruiter") redirect("/recruiter/dashboard");
  if (role === "admin") redirect("/auth/redirect");
  if (role === "candidate") {
    if (await hasCandidateProfileRow(user.id)) redirect("/candidate/jobs");
    redirect("/onboarding/candidate");
  }

  return <RoleOnboardingForm />;
}
