"use client";

type Props = {
  variant: "authenticated" | "anonymous";
  cumplesCon: string[];
  teFalta: string[];
  /** Solo vista anónima: aclara que no hay match personal. */
  footnote?: string | null;
};

export function JobRequirementBreakdown({
  variant,
  cumplesCon,
  teFalta,
  footnote,
}: Props) {
  return (
    <section className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm ring-1 ring-black/[0.02]">
      <h2 className="text-base font-semibold tracking-tight text-[#0F172A]">Desglose de encaje</h2>
      {variant === "anonymous" && footnote ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{footnote}</p>
      ) : null}

      <div className="mt-5 grid gap-8 sm:grid-cols-2 sm:gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800/90">
            Cumples con
          </h3>
          <ul className="mt-3 space-y-2.5 text-sm leading-snug text-[#334155]">
            {cumplesCon.map((line, i) => (
              <li key={`m-${i}`} className="flex gap-2.5">
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Te falta</h3>
          <ul className="mt-3 space-y-2.5 text-sm leading-snug text-[#334155]">
            {teFalta.map((line, i) => (
              <li key={`g-${i}`} className="flex gap-2.5">
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
