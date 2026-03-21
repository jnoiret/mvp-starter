import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  isRecruiterAreaAllowed,
} from "@/lib/auth/getCurrentProfile";
import { RecruiterNav } from "@/components/recruiter/RecruiterNav";

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

  if (!isRecruiterAreaAllowed(profile?.role)) {
    redirect("/auth/redirect");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8">
      <div className="flex flex-col gap-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-[#475569]">Fichur · Reclutador</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/recruiter/dashboard"
                className="text-base font-semibold tracking-tight text-[#0F172A]"
              >
                Reclutador
              </Link>
              <RecruiterNav />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
