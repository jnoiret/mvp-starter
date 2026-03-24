import { redirect } from "next/navigation";
import { HomeLanding } from "@/components/marketing/HomeLanding";
import {
  effectiveProfileRole,
  isAllowedAdminEmail,
} from "@/lib/admin/adminAllowlist";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    return <HomeLanding />;
  }

  const email = user.email ?? profile?.email ?? null;
  const role = effectiveProfileRole(email, profile?.role);

  if (!role) {
    redirect("/auth/redirect");
  }

  if (role === "candidate") {
    redirect("/candidate/dashboard");
  }

  if (role === "recruiter") {
    redirect("/recruiter/dashboard");
  }

  if (role === "admin") {
    if (isAllowedAdminEmail(email)) {
      redirect("/admin/dashboard");
    }
    redirect("/candidate/dashboard");
  }

  redirect("/auth/redirect");
}
