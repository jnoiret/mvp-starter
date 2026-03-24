import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { effectiveProfileRole } from "@/lib/admin/adminAllowlist";
import {
  getCurrentProfile,
  isRecruiterAreaAllowed,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

export default async function RecruiterLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  const role = effectiveProfileRole(user.email ?? profile?.email, profile?.role);
  if (!isRecruiterAreaAllowed(role)) {
    redirect("/auth/redirect");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8">
      <div className="flex flex-col gap-6">
        <header className="border-b border-zinc-200/80 pb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Área reclutador
          </p>
          <Link
            href="/recruiter/dashboard"
            className="mt-1 inline-block text-lg font-semibold tracking-tight text-[#0F172A] transition hover:text-zinc-700"
          >
            Panel de contratación
          </Link>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Navega con los enlaces del encabezado o desde el menú de tu cuenta.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
