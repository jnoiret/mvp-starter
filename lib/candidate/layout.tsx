import { redirect } from "next/navigation";
import {
  canAccessCandidateRoutes,
  resolveAppRole,
} from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    redirect("/auth/redirect");
  }

  const role = resolveAppRole(user.email, profile?.role);
  if (!canAccessCandidateRoutes(role)) {
    redirect("/auth/redirect");
  }

  return <>{children}</>;
}