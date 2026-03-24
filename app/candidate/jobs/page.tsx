"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { JobRequirementBreakdown } from "@/components/jobs/JobRequirementBreakdown";
import {
  JobsSmartListHeader,
  type JobsListSortMode,
} from "@/components/jobs/JobsSmartListHeader";
import {
  getJobMatchAnalysis,
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ProductEmptyState } from "@/components/shared/ProductEmptyState";
import { deriveJobApplicationStateMap } from "@/lib/candidate/application-state";
import {
  calculateMatchScore,
  getPostedAgeLabel,
  orderJobsChronological,
  orderJobsWithCandidateRanking,
  type JobListingRow,
} from "@/lib/jobs/candidateJobsRanking";
import { computeJobRequirementBreakdown } from "@/lib/jobs/jobRequirementBreakdown";
import {
  alignmentSummaryFromTier,
  applyJobCardCtaLabel,
  competenciaEstimadaLine,
  getBreakdownNarrativeSummary,
  getProbabilityNarrativeSummary,
  getProbabilityPresentation,
  getProbabilityPresentationFromRequirementBreakdown,
} from "@/lib/jobs/responseProbabilityUi";
import {
  getJobCardMetaLines,
  getJobCardWhyBullets,
  jobCardWhyHeading,
} from "@/lib/jobs/jobCardDecisionSignals";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type JobListing = JobListingRow;

type CandidateProfile = {
  id: string;
  email: string | null;
  target_role: string | null;
  work_mode: string | null;
  skills: string | null;
  city: string | null;
  expected_salary: number | null;
  summary?: string | null;
  industries?: string | null;
  years_experience?: number | null;
};

type Status = "idle" | "loading" | "success" | "error";
type ApplicationAction = "saved" | "applied";
type ApplicationStatusMap = Record<
  string,
  {
    saved: boolean;
    applied: boolean;
  }
>;

type HiddenUndoState = {
  jobId: string;
  title: string;
};

function toSkillList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
  }
  return value
    .split(",")
    .map((item) =>
      item
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function formatSkillLabelEs(skill: string) {
  const normalized = skill.trim().toLowerCase();
  const dictionary: Record<string, string> = {
    "ux design": "Diseño UX",
    "ui design": "Diseño UI",
    "user research": "Investigación de usuarios",
    "design systems": "Design Systems",
    sql: "SQL",
  };
  if (dictionary[normalized]) return dictionary[normalized];
  return skill
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

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

function buildMatchPayload(job: JobListing, candidate: CandidateProfile) {
  return {
    candidate_profile: {
      summary: candidate.summary ?? "",
      skills: candidate.skills ?? "",
      // No candidate_profiles.tools column — stack/tooling is covered by skills.
      tools: "",
      industries: candidate.industries ?? "",
      // No candidate_profiles.seniority column in schema.
      seniority: "",
      years_experience: candidate.years_experience ?? 0,
    },
    job_listing: {
      title: job.title ?? "",
      company: job.company_name ?? "",
      description: job.description ?? "",
      requirements: Array.isArray(job.required_skills)
        ? job.required_skills.join(", ")
        : (job.required_skills ?? ""),
      industry: "",
    },
  };
}

export default function CandidateJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applicationStatusByJob, setApplicationStatusByJob] =
    useState<ApplicationStatusMap>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [viewedJobIds, setViewedJobIds] = useState<Set<string>>(new Set());
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [hideLoadingByJob, setHideLoadingByJob] = useState<Record<string, boolean>>({});
  const [hiddenUndo, setHiddenUndo] = useState<HiddenUndoState | null>(null);
  const [aiMatchByJobId, setAiMatchByJobId] = useState<Record<string, MatchAnalysis>>({});
  const persistedViewKeysRef = useRef<Set<string>>(new Set());
  const viewSourceRef = useRef<"split_view_selection" | "auto_select">("auto_select");
  const hiddenUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listSortMode, setListSortMode] = useState<JobsListSortMode>("prioritized");

  const rankedJobs = useMemo(
    () =>
      orderJobsWithCandidateRanking(
        jobs,
        candidate,
        hiddenJobIds,
        applicationStatusByJob,
        viewedJobIds,
      ),
    [jobs, candidate, hiddenJobIds, applicationStatusByJob, viewedJobIds],
  );

  const displayJobs = useMemo(() => {
    if (listSortMode === "all") {
      return orderJobsChronological(jobs, hiddenJobIds);
    }
    return rankedJobs;
  }, [listSortMode, jobs, hiddenJobIds, rankedJobs]);

  useEffect(() => {
    if (displayJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    setSelectedJobId((prev) => {
      if (prev && displayJobs.some((job) => job.id === prev)) return prev;
      viewSourceRef.current = "auto_select";
      return displayJobs[0].id;
    });
  }, [displayJobs]);

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
              "id, title, company_name, city, work_mode, salary_range, description, required_skills, created_at"
            ),
          supabase
            .from("candidate_profiles")
            .select(
              "id, email, target_role, work_mode, skills, city, expected_salary, summary, industries, years_experience"
            )
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

        const candidateProfile = candidateRes.data?.[0] ?? null;
        setJobs(jobsRes.data ?? []);
        setCandidate(candidateProfile);

        const candidateEmail = candidateProfile?.email?.trim();
        const candidateId = candidateProfile?.id;
        if (candidateEmail || candidateId) {
          const [
            { data: applicationsData, error: applicationsError },
            { data: viewsData, error: viewsError },
            { data: hiddenData, error: hiddenError },
          ] =
            await Promise.all([
              candidateEmail
                ? supabase
                    .from("applications")
                    .select("job_id, status")
                    .eq("candidate_email", candidateEmail)
                    .in("status", ["saved", "applied"])
                : Promise.resolve({ data: [], error: null }),
              candidateId
                ? supabase
                    .from("candidate_job_views")
                    .select("job_id")
                    .eq("candidate_id", candidateId)
                : Promise.resolve({ data: [], error: null }),
              candidateId
                ? supabase
                    .from("candidate_hidden_jobs")
                    .select("job_id")
                    .eq("candidate_id", candidateId)
                : Promise.resolve({ data: [], error: null }),
            ]);

          if (applicationsError) {
            setStatus("error");
            setErrorMessage(applicationsError.message);
            return;
          }
          if (viewsError) {
            setStatus("error");
            setErrorMessage(viewsError.message);
            return;
          }
          if (hiddenError) {
            setStatus("error");
            setErrorMessage(hiddenError.message);
            return;
          }

          const nextStatusMap = deriveJobApplicationStateMap(
            (applicationsData ?? []).map((item) => ({
              job_id: (item.job_id as string | null) ?? null,
              status: (item.status as string | null) ?? null,
            }))
          );
          setApplicationStatusByJob(nextStatusMap);
          setViewedJobIds(
            new Set(
              (viewsData ?? [])
                .map((item) => String(item.job_id ?? ""))
                .filter(Boolean)
            )
          );
          setHiddenJobIds(
            new Set(
              (hiddenData ?? [])
                .map((item) => String(item.job_id ?? ""))
                .filter(Boolean)
            )
          );
        } else {
          setApplicationStatusByJob({});
          setViewedJobIds(new Set());
          setHiddenJobIds(new Set());
        }

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

  function stopCardNavigation(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    async function persistViewedJob() {
      const candidateId = candidate?.id ?? null;
      const jobId = selectedJobId ?? null;
      const flow = viewSourceRef.current;

      if (!candidateId || !jobId) {
        console.warn("[jobs] skip viewed persist: missing candidate_id or job_id", {
          candidate_id: candidateId,
          job_id: jobId,
          flow,
        });
        return;
      }

      const key = `${candidateId}:${jobId}`;
      if (persistedViewKeysRef.current.has(key)) {
        console.info("[jobs] skip viewed persist: already persisted for key", {
          candidate_id: candidateId,
          job_id: jobId,
          flow,
          key,
        });
        return;
      }

      const payload = {
        candidate_id: candidateId,
        job_id: jobId,
        viewed_at: new Date().toISOString(),
      };
      if (process.env.NODE_ENV !== "production") {
        console.info("[jobs] persisting viewed state", {
          flow,
          candidate_id: candidateId,
          job_id: jobId,
          payload,
        });
      }

      persistedViewKeysRef.current.add(key);
      setViewedJobIds((prev) => {
        const next = new Set(prev);
        next.add(jobId);
        return next;
      });

      const supabase = getSupabaseBrowserClient();
      const response = await supabase.from("candidate_job_views").upsert(payload, {
        onConflict: "candidate_id,job_id",
        ignoreDuplicates: true,
      });
      const { error } = response;

      if (process.env.NODE_ENV !== "production") {
        console.info("[jobs] viewed persist response", {
          flow,
          candidate_id: candidateId,
          job_id: jobId,
          error,
        });
      }

      if (error) {
        const isDuplicateConflict = error.code === "23505";
        if (isDuplicateConflict) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[jobs] duplicate viewed row ignored", {
              flow,
              candidate_id: candidateId,
              job_id: jobId,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          }
          return;
        }

        // Allow retry when user opens/selects the job again.
        persistedViewKeysRef.current.delete(key);
        console.warn("[jobs] viewed persist failed (non-critical)", {
          flow,
          candidate_id: candidateId,
          job_id: jobId,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }
    }

    void persistViewedJob();
  }, [candidate?.id, selectedJobId]);

  useEffect(() => {
    return () => {
      if (hiddenUndoTimerRef.current) {
        clearTimeout(hiddenUndoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAiMatchAnalysis() {
      if (!candidate || rankedJobs.length === 0) return;

      const topJobs = rankedJobs.slice(0, 12);
      const selected = selectedJobId
        ? rankedJobs.find((job) => job.id === selectedJobId) ?? null
        : null;
      const jobsToAnalyze = selected
        ? [...topJobs, selected].filter(
            (job, index, arr) => arr.findIndex((item) => item.id === job.id) === index
          )
        : topJobs;
      await Promise.all(
        jobsToAnalyze.map(async (job) => {
          if (aiMatchByJobId[job.id]) return;
          try {
            const analysis = await getJobMatchAnalysis(buildMatchPayload(job, candidate));
            if (cancelled) return;
            setAiMatchByJobId((prev) => {
              if (prev[job.id]) return prev;
              return { ...prev, [job.id]: analysis };
            });
          } catch {
            // Keep deterministic fallback rendering.
          }
        })
      );
    }

    void hydrateAiMatchAnalysis();

    return () => {
      cancelled = true;
    };
  }, [candidate, rankedJobs, aiMatchByJobId, selectedJobId]);

  async function handleHideJob(job: JobListing) {
    const candidateId = candidate?.id ?? null;
    if (!candidateId) {
      console.warn("[jobs] skip hide: missing candidate_id", { job_id: job.id });
      return;
    }

    setHideLoadingByJob((prev) => ({ ...prev, [job.id]: true }));
    setHiddenJobIds((prev) => {
      const next = new Set(prev);
      next.add(job.id);
      return next;
    });

    if (hiddenUndoTimerRef.current) {
      clearTimeout(hiddenUndoTimerRef.current);
    }
    setHiddenUndo({
      jobId: job.id,
      title: job.title ?? "Vacante",
    });
    hiddenUndoTimerRef.current = setTimeout(() => {
      setHiddenUndo((prev) => (prev?.jobId === job.id ? null : prev));
      hiddenUndoTimerRef.current = null;
    }, 5000);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("candidate_hidden_jobs").upsert(
        {
          candidate_id: candidateId,
          job_id: job.id,
          hidden_at: new Date().toISOString(),
        },
        {
          onConflict: "candidate_id,job_id",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        setHiddenJobIds((prev) => {
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        });
        console.warn("[jobs] hide job failed (non-critical)", {
          candidate_id: candidateId,
          job_id: job.id,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }
    } finally {
      setHideLoadingByJob((prev) => ({ ...prev, [job.id]: false }));
    }
  }

  async function handleUndoHide() {
    if (!hiddenUndo) return;
    const candidateId = candidate?.id ?? null;
    const jobId = hiddenUndo.jobId;

    if (hiddenUndoTimerRef.current) {
      clearTimeout(hiddenUndoTimerRef.current);
      hiddenUndoTimerRef.current = null;
    }
    setHiddenUndo(null);
    setHiddenJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });

    if (!candidateId) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("candidate_hidden_jobs")
      .delete()
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId);

    if (error) {
      console.warn("[jobs] undo hide failed (non-critical)", {
        candidate_id: candidateId,
        job_id: jobId,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
  }

  async function handleApplicationAction(job: JobListing, action: ApplicationAction) {
    const key = `${job.id}:${action}`;
    setActionFeedback((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const candidateEmail = candidate?.email?.trim();
      if (!candidateEmail) {
        setActionFeedback((prev) => ({
          ...prev,
          [key]: {
            type: "error",
            message: "No encontramos tu email de candidato. Completa tu perfil primero.",
          },
        }));
        return;
      }

      const currentStatus = applicationStatusByJob[job.id];
      if (
        (action === "saved" && currentStatus?.saved) ||
        (action === "applied" && currentStatus?.applied)
      ) {
        setActionFeedback((prev) => ({
          ...prev,
          [key]: {
            type: "success",
            message: action === "saved" ? "Esta vacante ya está guardada." : "Ya estás postulado.",
          },
        }));
        return;
      }

      const supabase = getSupabaseBrowserClient();

      const { data: existing, error: existingError } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_email", candidateEmail)
        .eq("job_id", job.id)
        .eq("status", action)
        .limit(1);

      if (existingError) {
        setActionFeedback((prev) => ({
          ...prev,
          [key]: { type: "error", message: existingError.message },
        }));
        return;
      }

      if ((existing ?? []).length > 0) {
        setActionFeedback((prev) => ({
          ...prev,
          [key]: {
            type: "success",
            message:
              action === "saved"
                ? "Esta vacante ya está guardada."
                : "Ya te habías postulado a esta vacante.",
          },
        }));
        return;
      }

      const { error: insertError } = await supabase.from("applications").insert({
        candidate_email: candidateEmail,
        job_id: job.id,
        status: action,
      });

      if (insertError) {
        setActionFeedback((prev) => ({
          ...prev,
          [key]: { type: "error", message: insertError.message },
        }));
        return;
      }

      setActionFeedback((prev) => ({
        ...prev,
        [key]: {
          type: "success",
          message:
            action === "saved"
              ? "Vacante guardada correctamente."
              : "Postulación registrada correctamente.",
        },
      }));
      setApplicationStatusByJob((prev) => {
        const current = prev[job.id] ?? { saved: false, applied: false };
        return {
          ...prev,
          [job.id]:
            action === "saved"
              ? { ...current, saved: true }
              : { saved: current.saved, applied: true },
        };
      });
    } catch (err) {
      setActionFeedback((prev) => ({
        ...prev,
        [key]: {
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Error inesperado al registrar la acción.",
        },
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

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
      <ProductEmptyState
        title="No hay vacantes disponibles ahora"
        subtitle="Cuando se publiquen oportunidades, podrás verlas aquí con señales claras de encaje."
        ctaLabel="Ver postulaciones"
        ctaHref="/candidate/applications"
        icon="search"
      />
    );
  } else if (displayJobs.length === 0) {
    content = (
      <ProductEmptyState
        title="No hay vacantes en esta vista"
        subtitle="Puede que las hayas ocultado o el filtro actual no muestre resultados. Prueba el orden «Todas las vacantes» arriba o vuelve a tu panel."
        ctaLabel="Ir a tu panel"
        ctaHref="/candidate/dashboard"
        icon="inbox"
      />
    );
  } else {
    const selectedJob =
      displayJobs.find((job) => job.id === selectedJobId) ?? displayJobs[0] ?? null;

    content = (
      <>
        {!candidate ? (
          <div className="mb-6">
            <ProductEmptyState
              title="Tu perfil aún no está listo"
              subtitle="Genera tu perfil con IA para empezar a recibir vacantes con mayor probabilidad de respuesta."
              ctaLabel="Crear perfil con IA"
              ctaHref="/onboarding"
              icon="profile"
            />
          </div>
        ) : null}
        <JobsSmartListHeader mode={listSortMode} onModeChange={setListSortMode} />
        <section className="grid gap-4 sm:gap-5 md:hidden">
          {displayJobs.map((job) => {
            const score = calculateMatchScore(job, candidate);
            const aiMatch = aiMatchByJobId[job.id] ?? null;
            const requirementBreakdown = candidate
              ? computeJobRequirementBreakdown(job, {
                  target_role: candidate.target_role,
                  skills: candidate.skills,
                  years_experience: candidate.years_experience ?? null,
                })
              : null;
            const probability = requirementBreakdown
              ? getProbabilityPresentationFromRequirementBreakdown(requirementBreakdown.tier, aiMatch)
              : getProbabilityPresentation(aiMatch, score);
            const metaLines = getJobCardMetaLines(job);
            const whyBullets = getJobCardWhyBullets(job, candidateForJobCard(candidate), {
              aiStrengths: aiMatch?.strengths,
            });
            const jobStatus = applicationStatusByJob[job.id] ?? {
              saved: false,
              applied: false,
            };
            const isSaved = jobStatus.saved;
            const isApplied = jobStatus.applied;
            const isViewed = viewedJobIds.has(job.id);
            const saveKey = `${job.id}:saved`;
            const applyKey = `${job.id}:applied`;
            const postedAge = getPostedAgeLabel(job.created_at);
            const stateBadge = isApplied
              ? "border border-emerald-600 bg-emerald-600 text-white shadow-sm"
              : isSaved
                ? "border border-slate-200 bg-slate-100 text-slate-700"
                : null;
            const stateLabel = isApplied
              ? "Postulado"
              : isSaved
                ? "Guardada"
                : isViewed
                  ? "Visto"
                  : null;
            const stateBadgeClass =
              stateLabel === "Visto"
                ? "border border-slate-200 bg-slate-50 text-slate-500"
                : stateBadge;
            const cardStateClass = isApplied
              ? "ring-1 ring-emerald-200/90 bg-emerald-50/30"
              : isSaved
                ? "ring-1 ring-slate-200/90"
                : "";

            return (
              <article
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/candidate/jobs/${job.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/candidate/jobs/${job.id}`);
                  }
                }}
                className={`ds-card relative flex cursor-pointer flex-col p-5 sm:p-6 ${cardStateClass}`}
              >
                <button
                  type="button"
                  aria-label="Ocultar vacante"
                  onClick={(event) => {
                    stopCardNavigation(event);
                    void handleHideJob(job);
                  }}
                  disabled={hideLoadingByJob[job.id] === true}
                  className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-60"
                >
                  {hideLoadingByJob[job.id] ? "…" : "×"}
                </button>
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-4">
                  <span
                    className={`inline-flex max-w-full rounded-full px-3 py-1 text-xs font-semibold ${probability.badgeClass}`}
                  >
                    {probability.label}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="ds-heading text-xl font-semibold leading-tight tracking-tight text-[#0F172A]">
                      {job.title ?? "Sin título"}
                    </h2>
                    <p className="text-sm font-medium text-[#475569]">
                      {job.company_name ?? "Empresa no especificada"}
                    </p>
                  </div>

                  <dl className="grid gap-1 text-xs text-[#64748B]">
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="font-semibold text-[#475569]">Ubicación</dt>
                      <dd>{metaLines.ubicacion}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="font-semibold text-[#475569]">Modalidad</dt>
                      <dd>{metaLines.modalidad}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="font-semibold text-[#475569]">Salario</dt>
                      <dd>{metaLines.salario}</dd>
                    </div>
                  </dl>

                  <p className="text-xs font-medium text-[#334155]">
                    {requirementBreakdown
                      ? alignmentSummaryFromTier(requirementBreakdown.tier).headline
                      : competenciaEstimadaLine(score)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {stateLabel ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${stateBadgeClass}`}
                      >
                        {isApplied ? "✓ " : ""}
                        {stateLabel}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs text-[#94A3B8]">
                    {postedAge ? <p>Publicado: {postedAge}</p> : null}
                  </div>
                </div>

                <div className="mt-6 border-t border-zinc-100 pt-4">
                  <div className="rounded-2xl bg-[#F8FAFF] p-3 sm:p-4">
                    <p className="text-sm font-medium text-[#334155]">{probability.label}</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#475569]">
                      {whyBullets.slice(0, 3).map((line, idx) => (
                        <li key={`${job.id}-apply-ctx-${idx}`} className="flex gap-2">
                          <span className="shrink-0 text-[#94A3B8]" aria-hidden>
                            ·
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                      <Button
                        variant={isApplied ? "secondary" : "primary"}
                        type="button"
                        onClick={(event) => {
                          stopCardNavigation(event);
                          void handleApplicationAction(job, "applied");
                        }}
                        disabled={actionLoading[applyKey] === true || isApplied}
                        className={
                          isApplied
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800 opacity-100 hover:border-emerald-300 hover:bg-emerald-100"
                            : "sm:order-2"
                        }
                      >
                        {applyJobCardCtaLabel(
                          isApplied,
                          actionLoading[applyKey] === true
                        )}
                      </Button>
                      {!isApplied ? (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={(event) => {
                            stopCardNavigation(event);
                            void handleApplicationAction(job, "saved");
                          }}
                          disabled={actionLoading[saveKey] === true || isSaved}
                          className={
                            isSaved
                              ? "sm:order-1 border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                              : "sm:order-2"
                          }
                        >
                          {actionLoading[saveKey]
                            ? "Guardando..."
                            : isSaved
                              ? "Guardada"
                              : "Guardar"}
                        </Button>
                      ) : null}
                    </div>
                    {isApplied ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        Ya postulaste a esta vacante.
                      </p>
                    ) : isSaved ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Vacante guardada para revisar despues.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {actionFeedback[saveKey] ? (
                    <p
                      className={`text-sm ${
                        actionFeedback[saveKey]?.type === "success"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {actionFeedback[saveKey]?.message}
                    </p>
                  ) : null}
                  {actionFeedback[applyKey] ? (
                    <p
                      className={`text-sm ${
                        actionFeedback[applyKey]?.type === "success"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {actionFeedback[applyKey]?.message}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <section className="hidden gap-6 overflow-hidden md:grid md:h-[calc(100vh-250px)] md:min-h-0 md:grid-cols-[clamp(360px,32vw,420px)_minmax(0,1fr)]">
          <aside className="ds-card h-full min-h-0 overflow-y-auto p-4">
            <div className="grid gap-3">
              {displayJobs.map((job) => {
                const score = calculateMatchScore(job, candidate);
                const aiMatch = aiMatchByJobId[job.id] ?? null;
                const requirementBreakdown = candidate
                  ? computeJobRequirementBreakdown(job, {
                      target_role: candidate.target_role,
                      skills: candidate.skills,
                      years_experience: candidate.years_experience ?? null,
                    })
                  : null;
                const probability = requirementBreakdown
                  ? getProbabilityPresentationFromRequirementBreakdown(requirementBreakdown.tier, aiMatch)
                  : getProbabilityPresentation(aiMatch, score);
                const postedAge = getPostedAgeLabel(job.created_at);
                const listMeta = getJobCardMetaLines(job);
                const listWhy = getJobCardWhyBullets(job, candidateForJobCard(candidate), {
                  aiStrengths: aiMatch?.strengths,
                });
                const listWhyHeading = jobCardWhyHeading(probability.tier);
                const state = applicationStatusByJob[job.id] ?? { saved: false, applied: false };
                const isSelected = selectedJob?.id === job.id;
                const isApplied = state.applied;
                const isSaved = state.saved;
                const isViewed = viewedJobIds.has(job.id);
                const cardStateLabel = isApplied
                  ? "Postulado"
                  : isSaved
                    ? "Guardada"
                    : isViewed
                      ? "Visto"
                      : null;
                return (
                  <article
                    key={job.id}
                    className={`group relative rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-[#4F46E5] bg-[#EEF2FF] shadow-sm"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Ocultar vacante"
                      onClick={(event) => {
                        stopCardNavigation(event);
                        void handleHideJob(job);
                      }}
                      disabled={hideLoadingByJob[job.id] === true}
                      className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm text-zinc-500 opacity-0 transition hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-60 group-hover:opacity-100"
                    >
                      {hideLoadingByJob[job.id] ? "…" : "×"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        viewSourceRef.current = "split_view_selection";
                        setSelectedJobId(job.id);
                      }}
                      className="w-full pr-8 text-left"
                    >
                      <span
                        className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ${probability.badgeClass}`}
                      >
                        {probability.label}
                      </span>
                      <p className="mt-2 text-base font-semibold leading-tight text-[#0F172A]">
                        {job.title ?? "Sin título"}
                      </p>
                      <p className="mt-1 text-xs text-[#475569]">
                        {job.company_name ?? "Empresa no especificada"}
                      </p>
                      <p className="mt-1.5 text-[11px] leading-tight text-[#64748B]">
                        {listMeta.ubicacion} · {listMeta.modalidad}
                      </p>
                      <p className="text-[11px] leading-tight text-[#64748B]">{listMeta.salario}</p>
                      <p className="mt-1.5 text-[11px] font-medium text-[#334155]">
                        {requirementBreakdown
                          ? alignmentSummaryFromTier(requirementBreakdown.tier).headline
                          : competenciaEstimadaLine(score)}
                      </p>
                      <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50/90 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                          {listWhyHeading}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-[#334155]">
                          {listWhy.slice(0, 2).map((line, idx) => (
                            <li key={`${job.id}-list-why-${idx}`} className="line-clamp-2">
                              · {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {cardStateLabel === "Postulado" ? (
                          <span className="rounded-full border border-emerald-600 bg-emerald-600 px-2.5 py-1 font-medium text-white">
                            Postulado
                          </span>
                        ) : cardStateLabel === "Guardada" ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                            Guardada
                          </span>
                        ) : cardStateLabel === "Visto" ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-500">
                            Visto
                          </span>
                        ) : null}
                      </div>
                      {postedAge ? (
                        <p className="mt-2 text-xs text-[#94A3B8]">{postedAge}</p>
                      ) : null}
                    </button>
                  </article>
                );
              })}
            </div>
          </aside>

          {selectedJob ? (
            (() => {
              const selectedState = applicationStatusByJob[selectedJob.id] ?? {
                saved: false,
                applied: false,
              };
              const isSaved = selectedState.saved;
              const isApplied = selectedState.applied;
              const saveKey = `${selectedJob.id}:saved`;
              const applyKey = `${selectedJob.id}:applied`;
              const selectedMatchScore = calculateMatchScore(selectedJob, candidate);
              const selectedAiMatch = aiMatchByJobId[selectedJob.id] ?? null;
              const selectedRequirementBreakdown = candidate
                ? computeJobRequirementBreakdown(selectedJob, {
                    target_role: candidate.target_role,
                    skills: candidate.skills,
                    years_experience: candidate.years_experience ?? null,
                  })
                : null;
              const selectedProbability = selectedRequirementBreakdown
                ? getProbabilityPresentationFromRequirementBreakdown(
                    selectedRequirementBreakdown.tier,
                    selectedAiMatch,
                  )
                : getProbabilityPresentation(selectedAiMatch, selectedMatchScore);
              const selectedMeta = getJobCardMetaLines(selectedJob);
              const selectedWhyBullets = getJobCardWhyBullets(
                selectedJob,
                candidateForJobCard(candidate),
                { aiStrengths: selectedAiMatch?.strengths }
              );

              return (
                <article className="ds-card h-full min-h-0 overflow-y-auto p-6 lg:p-8">
                  <div className="flex flex-col gap-7">
                    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-5">
                      <div>
                        <h2 className="ds-heading text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                          {selectedJob.title ?? "Vacante sin título"}
                        </h2>
                        <p className="mt-2 text-sm text-[#475569]">
                          {selectedJob.company_name ?? "Empresa no especificada"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-100 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold tracking-tight ${selectedProbability.badgeClass}`}
                        >
                          {selectedProbability.label}
                        </span>
                        {isApplied ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                            Postulado
                          </span>
                        ) : isSaved ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            Guardada
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid gap-1.5 text-sm text-[#64748B]">
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-semibold text-[#475569]">Ubicación</dt>
                          <dd>{selectedMeta.ubicacion}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-semibold text-[#475569]">Modalidad</dt>
                          <dd>{selectedMeta.modalidad}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-semibold text-[#475569]">Salario</dt>
                          <dd>{selectedMeta.salario}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-sm font-medium text-[#334155]">
                        {selectedRequirementBreakdown
                          ? alignmentSummaryFromTier(selectedRequirementBreakdown.tier).headline
                          : competenciaEstimadaLine(selectedMatchScore)}
                      </p>
                    </div>

                    {selectedRequirementBreakdown ? (
                      <JobRequirementBreakdown
                        variant="authenticated"
                        cumplesCon={selectedRequirementBreakdown.cumplesCon}
                        teFalta={selectedRequirementBreakdown.teFalta}
                      />
                    ) : null}

                    {selectedAiMatch ? (
                      <section className="rounded-xl border border-zinc-100 bg-white p-4">
                        <h3 className="text-sm font-semibold text-[#0F172A]">
                          Contexto adicional (IA)
                        </h3>
                        <p className="mt-1 text-sm text-[#475569]">{selectedAiMatch.summary}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Coincidencias (IA)
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                              {selectedAiMatch.strengths.map((item, idx) => (
                                <li key={`${item}-${idx}`}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                              Diferencias (IA)
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                              {selectedAiMatch.gaps.map((item, idx) => (
                                <li key={`${item}-${idx}`}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-xl border border-zinc-100 bg-white p-4">
                      <h3 className="text-sm font-medium text-[#0F172A]">Sobre la probabilidad mostrada</h3>
                      <p className="mt-2 text-sm text-[#64748B]">
                        {selectedRequirementBreakdown
                          ? getBreakdownNarrativeSummary(selectedRequirementBreakdown.tier)
                          : getProbabilityNarrativeSummary(selectedMatchScore)}
                      </p>
                    </section>

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
                        Descripción
                      </p>
                      <p className="text-sm leading-relaxed text-[#0F172A]">
                        {selectedJob.description ?? "Sin descripción."}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-zinc-100 pt-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
                        Habilidades requeridas
                      </p>
                      {toSkillList(selectedJob.required_skills).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {toSkillList(selectedJob.required_skills).map((skill, skillIndex) => (
                            <span
                              key={`${skill}-${skillIndex}`}
                              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              {formatSkillLabelEs(skill)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#475569]">
                          No especificadas para esta vacante.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 border-t border-zinc-100 pt-5">
                    <div className="rounded-2xl bg-[#F8FAFF] p-3 sm:p-4">
                      <p className="text-sm font-medium text-[#334155]">
                        {selectedProbability.label}
                      </p>
                      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#475569]">
                        {selectedWhyBullets.slice(0, 3).map((line, idx) => (
                          <li
                            key={`${selectedJob.id}-footer-ctx-${idx}`}
                            className="flex gap-2"
                          >
                            <span className="shrink-0 text-[#94A3B8]" aria-hidden>
                              ·
                            </span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <Button
                          variant={isApplied ? "secondary" : "primary"}
                          type="button"
                          onClick={() => handleApplicationAction(selectedJob, "applied")}
                          disabled={actionLoading[applyKey] === true || isApplied}
                          className={
                            isApplied
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800 opacity-100 hover:border-emerald-300 hover:bg-emerald-100"
                              : "sm:order-2"
                          }
                        >
                          {applyJobCardCtaLabel(
                            isApplied,
                            actionLoading[applyKey] === true
                          )}
                        </Button>
                        {!isApplied ? (
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => handleApplicationAction(selectedJob, "saved")}
                            disabled={actionLoading[saveKey] === true || isSaved}
                            className={
                              isSaved
                                ? "sm:order-1 border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                                : "sm:order-1"
                            }
                          >
                            {actionLoading[saveKey]
                              ? "Guardando..."
                              : isSaved
                                ? "Guardada"
                                : "Guardar"}
                          </Button>
                        ) : null}
                      </div>
                      {isApplied ? (
                        <p className="mt-2 text-xs text-emerald-700">
                          Ya postulaste a esta vacante.
                        </p>
                      ) : isSaved ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Vacante guardada para revisar despues.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {actionFeedback[saveKey] ? (
                      <p
                        className={`text-sm ${
                          actionFeedback[saveKey]?.type === "success"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {actionFeedback[saveKey]?.message}
                      </p>
                    ) : null}
                    {actionFeedback[applyKey] ? (
                      <p
                        className={`text-sm ${
                          actionFeedback[applyKey]?.type === "success"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {actionFeedback[applyKey]?.message}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })()
          ) : (
            <div className="ds-card h-full min-h-0 overflow-y-auto p-6">
              <EmptyState
                title="Selecciona una vacante"
                description="Elige una vacante de la lista para ver su detalle."
              />
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Vacantes"
        description="Explora oportunidades según probabilidad de respuesta y guarda las que te interesan."
        action={
          <Link href="/candidate/applications">
            <Button variant="secondary">Ver postulaciones</Button>
          </Link>
        }
      />
      {content}
      {hiddenUndo ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 w-[min(92vw,360px)]">
          <div className="pointer-events-auto ds-card border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0F172A]">Vacante oculta</p>
                <p className="mt-1 truncate text-xs text-[#64748B]">{hiddenUndo.title}</p>
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleUndoHide()}
                className="px-4 py-2 text-xs"
              >
                Deshacer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

