import type { ReactNode } from "react";
import Link from "next/link";
import { Section } from "@/components/shared/Section";
import { CandidateNav } from "@/components/candidate/CandidateNav";

export default function CandidateLayout({ children }: { children: ReactNode }) {
  return (
    <Section className="max-w-[1400px] px-6 py-10 md:px-8">
      <div className="flex flex-col gap-6">
        <header className="ds-card flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-[#475569]">
              Fichur Candidate MVP
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/"
                className="ds-heading text-base font-semibold tracking-tight"
              >
                Candidate
              </Link>
              <CandidateNav />
            </div>
          </div>
        </header>

        <div>{children}</div>
      </div>
    </Section>
  );
}

