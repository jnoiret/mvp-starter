import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  isCandidateAreaAllowed,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

export default async function CandidateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  if (!isCandidateAreaAllowed(profile?.role)) {
    redirect("/auth/redirect");
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-8">
      {children}
    </div>
  );
}
