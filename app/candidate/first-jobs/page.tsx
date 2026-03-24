"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  calculateMatchScore,
  orderJobsWithCandidateRanking,
  type CandidateMatchProfile,
  type JobListingRow,
} from "@/lib/jobs/candidateJobsRanking";
import {
  getProbabilityNarrativeSummary,
  getProbabilityPresentation,
} from "@/lib/jobs/responseProbabilityUi";
import { getJobCardWhyBullets } from "@/lib/jobs/jobCardDecisionSignals";
import { takeFirstJobsLandingIntent } from "@/lib/onboardingFirstJobs";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type CandidateProfile = CandidateMatchProfile & {
  summary?: string | null;
  industries?: string | null;
  years_experience?: number | null;
};

function candidateForJobCard(c: CandidateProfile | null): Parameters<
  typeof getJobCardWhyBullets
>[1] {
  if (!c) return null;
  return {
    target_role: c.target_role,
    skills: c.skills,
    industries: c.industries,
    years_experience: c.years_experience,
  };
}

export default function CandidateFirstJobsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobListingRow[]>([]);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!takeFirstJobsLandingIntent()) {
      router.replace("/candidate/jobs");
      return;
    }
    setAllowed(true);
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const [jobsRes, candidateRes] = await Promise.all([
          supabase
            .from("job_listings")
            .select(
              "id, title, company_name, city, work_mode, salary_range, description, required_skills, created_at",
            ),
          supabase
            .from("candidate_profiles")
            .select(
              "id, email, target_role, work_mode, skills, city, expected_salary, summary, industries, years_experience",
            )
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (cancelled) return;

        if (jobsRes.error) {
          setLoadError(jobsRes.error.message);
          setLoading(false);
          return;
        }
        if (candidateRes.error) {
          setLoadError(candidateRes.error.message);
          setLoading(false);
          return;
        }

        setJobs((jobsRes.data ?? []) as JobListingRow[]);
        setCandidate((candidateRes.data?.[0] as CandidateProfile) ?? null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Error al cargar vacantes.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const topPicks = useMemo(() => {
    if (!candidate || jobs.length === 0) return [];
    const ranked = orderJobsWithCandidateRanking(
      jobs,
      candidate,
      new Set(),
      {},
      new Set(),
    );
    return ranked.slice(0, 3);
  }, [jobs, candidate]);

  if (!allowed) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-16">
        <LoadingState />
        <p className="text-sm text-zinc-500">Redirigiendo…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-16">
        <LoadingState />
        <p className="text-sm text-zinc-500">Buscando vacantes para ti…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link
          href="/candidate/jobs"
          className="inline-block rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ir a vacantes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-xs font-medium uppercase tracking-wider text-[#0F172A]/55">
          Primer paso
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
          Estas vacantes podrían ser buenas para ti
        </h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Empezamos con unas pocas ideas alineadas a tu perfil. Explora el detalle o ve el listado
          completo cuando quieras.
        </p>
      </header>

      {topPicks.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center text-sm text-zinc-600">
          Aún no hay vacantes publicadas o tu perfil necesita un poco más de datos.{" "}
          <Link href="/candidate/jobs" className="font-semibold text-[#0F172A] underline">
            Ver todas las vacantes
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {topPicks.map((job) => {
            const score = calculateMatchScore(job, candidate);
            const probability = getProbabilityPresentation(null, score);
            const bullets = getJobCardWhyBullets(job, candidateForJobCard(candidate), {
              max: 2,
            });
            const explanation =
              bullets[0]?.trim() || getProbabilityNarrativeSummary(score);

            return (
              <li
                key={job.id}
                className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-lg font-semibold text-[#0F172A]">{job.title}</h2>
                    <p className="text-sm text-zinc-600">{job.company_name ?? "Empresa"}</p>
                  </div>
                  <span
                    className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${probability.badgeClass}`}
                  >
                    {probability.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-700">{explanation}</p>
                <div className="mt-4">
                  <Link
                    href={`/candidate/jobs/${job.id}`}
                    className="inline-flex rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900"
                  >
                    Ver vacante
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-zinc-200 pt-6">
        <Link
          href="/candidate/jobs"
          className="text-sm font-semibold text-[#0F172A] underline decoration-zinc-300 underline-offset-2 hover:decoration-[#0F172A]"
        >
          Explorar todas las vacantes
        </Link>
      </div>
    </div>
  );
}
