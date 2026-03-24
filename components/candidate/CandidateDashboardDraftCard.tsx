"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadOnboardingDraft } from "@/lib/auth/onboardingDraftStorage";

export function CandidateDashboardDraftCard() {
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    setHasDraft(loadOnboardingDraft() !== null);
  }, []);

  if (!hasDraft) return null;

  return (
    <Link
      href="/onboarding"
      className="group flex items-center justify-between gap-4 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-orange-50/50 px-5 py-4 transition hover:border-amber-300 hover:shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-950">
          Tienes un borrador de perfil
        </p>
        <p className="mt-0.5 text-xs text-amber-900/70">
          Retoma donde lo dejaste y termina en un momento.
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-amber-900 group-hover:text-amber-950">
        Continuar →
      </span>
    </Link>
  );
}
