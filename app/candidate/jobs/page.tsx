/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type JobListing = {
  title: string | null;
  company_name: string | null;
  city: string | null;
  work_mode: string | null;
  salary_range: string | null;
  short_description: string | null;
  required_skills: string | string[] | null;
};

type CandidateProfile = {
  target_role: string | null;
  work_mode: string | null;
  skills: string | null;
};

type Status = "idle" | "loading" | "success" | "error";

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSkillList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
}

function roleMatchesClosely(targetRole: string | null, jobTitle: string | null) {
  if (!targetRole || !jobTitle) return false;
  const role = normalize(targetRole);
  const title = normalize(jobTitle);
  if (!role || !title) return false;

  if (role === title || role.includes(title) || title.includes(role)) return true;

  const roleTokens = role.split(" ").filter(Boolean);
  const titleTokens = title.split(" ").filter(Boolean);
  if (roleTokens.length === 0 || titleTokens.length === 0) return false;

  const overlap = roleTokens.filter((token) => titleTokens.includes(token)).length;
  const ratio = overlap / Math.max(roleTokens.length, titleTokens.length);
  return ratio >= 0.6;
}

function calculateMatchScore(job: JobListing, candidate: CandidateProfile | null) {
  if (!candidate) return 0;

  let score = 0;

  if (roleMatchesClosely(candidate.target_role, job.title)) {
    score += 40;
  }

  if (
    candidate.work_mode &&
    job.work_mode &&
    normalize(candidate.work_mode) === normalize(job.work_mode)
  ) {
    score += 20;
  }

  const candidateSkills = toSkillList(candidate.skills);
  const requiredSkills = toSkillList(job.required_skills);

  if (candidateSkills.length > 0 && requiredSkills.length > 0) {
    const sharedCount = requiredSkills.filter((skill) =>
      candidateSkills.includes(skill)
    ).length;
    const skillsScore = Math.round((sharedCount / requiredSkills.length) * 40);
    score += Math.min(40, Math.max(0, skillsScore));
  }

  return Math.min(100, Math.max(0, score));
}

function getMatchLabel(score: number) {
  if (score >= 70) return "Alto match";
  if (score >= 40) return "Match medio";
  return "Bajo match";
}

export default function CandidateJobsPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadJobListings() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const [jobsRes, candidateRes] = await Promise.all([
          supabase
            .from("job_listings")
            .select(
              "title, company_name, city, work_mode, salary_range, short_description, required_skills"
            ),
          supabase
            .from("candidate_profiles")
            .select("target_role, work_mode, skills")
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (!isMounted) return;

        if (jobsRes.error) {
          setStatus("error");
          setErrorMessage(jobsRes.error.message);
          return;
        }

        if (candidateRes.error) {
          setStatus("error");
          setErrorMessage(candidateRes.error.message);
          return;
        }

        setJobs(jobsRes.data ?? []);
        setCandidate(candidateRes.data?.[0] ?? null);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error inesperado cargando vacantes."
        );
      }
    }

    loadJobListings();

    return () => {
      isMounted = false;
    };
  }, []);

  let content: React.ReactNode = null;

  if (status === "idle" || status === "loading") {
    content = <LoadingState />;
  } else if (status === "error") {
    content = (
      <EmptyState
        title="No pudimos cargar vacantes"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  } else if (jobs.length === 0) {
    content = (
      <EmptyState
        title="No hay vacantes disponibles"
        description="Cuando existan vacantes en Fichur, aparecerán aquí."
      />
    );
  } else {
    content = (
      <section className="grid gap-4 sm:gap-5">
        {jobs.map((job, index) => (
          <article
            key={`${job.title ?? "job"}-${index}`}
            className="ds-card p-5 sm:p-6"
          >
            {(() => {
              const score = calculateMatchScore(job, candidate);
              const label = getMatchLabel(score);
              const labelStyles =
                score >= 70
                  ? "bg-emerald-100 text-emerald-700"
                  : score >= 40
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-700";

              return (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[#0F172A]">
                    Score: {score}/100
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${labelStyles}`}
                  >
                    {label}
                  </span>
                </div>
              );
            })()}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="ds-heading text-lg font-semibold tracking-tight">
                    {job.title ?? "Sin título"}
                  </h2>
                  <p className="mt-1 text-sm text-[#475569]">
                    {job.company_name ?? "Empresa no especificada"}
                  </p>
                </div>
                <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
                  {job.work_mode ?? "Sin modalidad"}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#475569]">
                <p>Ciudad: {job.city ?? "No especificada"}</p>
                <p>Salario: {job.salary_range ?? "No especificado"}</p>
              </div>

              <p className="text-sm leading-relaxed text-[#0F172A]">
                {job.short_description ?? "Sin descripción breve."}
              </p>
            </div>
          </article>
        ))}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Vacantes"
        description="Explora oportunidades y guarda las que te interesan."
        action={
          <Link href="/candidate/applications">
            <Button variant="secondary">Ver postulaciones</Button>
          </Link>
        }
      />
      {content}
    </div>
  );
}

