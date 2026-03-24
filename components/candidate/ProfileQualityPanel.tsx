"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  analyzeProfileQuality,
  type ProfileQualityInput,
  type ProfileQualityTier,
} from "@/lib/candidate/profileQualityScore";

function tierBadgeClass(tier: ProfileQualityTier): string {
  if (tier === "low") return "border-rose-200 bg-rose-50 text-rose-900";
  if (tier === "medium") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

type Props = {
  profile: ProfileQualityInput | null | undefined;
  /** Defaults to /candidate/onboarding */
  editHref?: string;
  /** Show “Editar perfil” on each recommendation (e.g. off while already on the editor). */
  showEditLinks?: boolean;
  variant?: "default" | "compact";
  className?: string;
};

export function ProfileQualityPanel({
  profile,
  editHref = "/candidate/onboarding",
  showEditLinks = true,
  variant = "default",
  className = "",
}: Props) {
  const { score, tier, label, recommendations } = useMemo(
    () => analyzeProfileQuality(profile),
    [profile],
  );

  const isCompact = variant === "compact";

  return (
    <section
      className={[
        "rounded-2xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-100",
        isCompact ? "p-4" : "p-5",
        className,
      ].join(" ")}
      aria-labelledby="profile-quality-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="profile-quality-heading"
            className={`font-semibold tracking-tight text-[#0F172A] ${isCompact ? "text-sm" : "text-base"}`}
          >
            Calidad de perfil: {score}%
          </h2>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tierBadgeClass(tier)}`}
          >
            {label}
          </span>
        </div>
        {showEditLinks ? (
          <Link
            href={editHref}
            className={`shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs font-semibold text-[#0F172A] transition hover:bg-zinc-100 sm:px-4 ${isCompact ? "" : "text-sm"}`}
          >
            Editar perfil
          </Link>
        ) : null}
      </div>

      {recommendations.length > 0 ? (
        <ul className={`mt-4 space-y-3 ${isCompact ? "text-xs" : "text-sm"}`}>
          {recommendations.map((rec) => (
            <li
              key={rec.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="leading-relaxed text-zinc-700">{rec.text}</span>
              {showEditLinks ? (
                <Link
                  href={editHref}
                  className="shrink-0 text-xs font-semibold text-[#0F172A] underline decoration-zinc-300 underline-offset-2 hover:decoration-[#0F172A]"
                >
                  Editar perfil
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
