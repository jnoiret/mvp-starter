import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  console.log("[recruiter layout] user:", user?.email ?? null, userError ?? null);

  if (userError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  console.log("[recruiter layout] profile:", profile, profileError ?? null);

  if (profileError || !profile || profile.role !== "recruiter") {
    redirect("/login");
  }

  return <>{children}</>;
}