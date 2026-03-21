import { redirect } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

export default async function AuthRedirectPage() {
  const { user, profile } = await getCurrentProfile();

  if (!user || !profile?.role) {
    redirect("/login");
  }

  switch (profile.role) {
    case "candidate":
      redirect("/candidate/dashboard");
    case "recruiter":
      redirect("/recruiter/dashboard");
    case "admin": {
      const email = user.email ?? profile.email ?? null;
      if (isAllowedAdminEmail(email)) {
        redirect("/admin/dashboard");
      }
      redirect("/");
    }
    default:
      redirect("/login");
  }
}
