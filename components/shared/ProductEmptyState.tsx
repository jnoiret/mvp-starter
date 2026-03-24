import Link from "next/link";
import { cn } from "@/lib/utils";

type IconKind = "sparkles" | "inbox" | "profile" | "search" | "people";

function EmptyIcon({ kind }: { kind: IconKind }) {
  const common = "h-14 w-14 text-indigo-500/90";
  switch (kind) {
    case "sparkles":
      return (
        <svg className={common} viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="26" className="fill-indigo-50 stroke-indigo-100" strokeWidth="1.5" />
          <path
            d="M28 12l1.8 5.5h5.9L31 21l1.8 5.5L28 24.8 23.2 26.5 25 21l-4.7-3.5h5.9L28 12z"
            className="fill-indigo-400/90"
          />
          <path
            d="M18 32l1 3h3.2l-2.6 2 1 3-2.6-1.9-2.6 1.9 1-3-2.6-2h3.2l1-3z"
            className="fill-violet-400/80"
          />
          <path
            d="M36 34l0.9 2.7h2.9l-2.4 1.7 0.9 2.7-2.4-1.8-2.4 1.8 0.9-2.7-2.4-1.7h2.9L36 34z"
            className="fill-indigo-300/90"
          />
        </svg>
      );
    case "inbox":
      return (
        <svg className={common} viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="26" className="fill-indigo-50 stroke-indigo-100" strokeWidth="1.5" />
          <path
            d="M16 22h24v14H16V22zm0 0l8 8h8l8-8"
            className="stroke-indigo-400"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case "profile":
      return (
        <svg className={common} viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="26" className="fill-indigo-50 stroke-indigo-100" strokeWidth="1.5" />
          <circle cx="28" cy="22" r="6" className="stroke-indigo-400" strokeWidth="2" fill="none" />
          <path
            d="M18 40c1.5-5 6-8 10-8s8.5 3 10 8"
            className="stroke-indigo-400"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
    case "search":
      return (
        <svg className={common} viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="26" className="fill-indigo-50 stroke-indigo-100" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="7" className="stroke-indigo-400" strokeWidth="2" fill="none" />
          <path d="M29 29l8 8" className="stroke-indigo-400" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "people":
      return (
        <svg className={common} viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="26" className="fill-indigo-50 stroke-indigo-100" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="4" className="fill-indigo-300/80" />
          <circle cx="34" cy="22" r="4" className="fill-violet-300/80" />
          <path
            d="M16 38c2-4 5.5-6 8-6h8c2.5 0 6 2 8 6"
            className="stroke-indigo-400"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
    default:
      return null;
  }
}

export type ProductEmptyStateProps = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  icon?: IconKind;
  className?: string;
};

/**
 * Centered, product-grade empty state with one primary action.
 */
export function ProductEmptyState({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  icon = "sparkles",
  className,
}: ProductEmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center rounded-3xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/90 px-6 py-12 text-center shadow-sm sm:max-w-lg sm:px-10",
        className,
      )}
    >
      <div className="mb-5 flex justify-center" aria-hidden>
        <EmptyIcon kind={icon} />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-[#0F172A] sm:text-xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{subtitle}</p>
      <Link
        href={ctaHref}
        className={cn(
          "mt-8 inline-flex min-h-[44px] items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-white shadow-md transition",
          "ds-accent-gradient hover:brightness-95 active:brightness-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B4EFF] focus-visible:ring-offset-2",
        )}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
