"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoginModal } from "@/components/auth/LoginModal";
import {
  JobsSmartListHeader,
  type JobsListSortMode,
} from "@/components/jobs/JobsSmartListHeader";
import {
  getJobMatchAnalysis,
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { JobRequirementBreakdown } from "@/components/jobs/JobRequirementBreakdown";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { deriveJobApplicationStateMap } from "@/lib/candidate/application-state";
import { savePostLoginJobRedirect } from "@/lib/auth/postLoginRedirect";
import {
  calculateMatchScore,
  getPostedAgeLabel,
  orderJobsChronological,
  orderJobsWithCandidateRanking,
  type ApplicationStatusMap,
  type JobListingRow,
  type CandidateMatchProfile,
} from "@/lib/jobs/candidateJobsRanking";
import {
  getJobCardMetaLines,
  getJobCardWhyBullets,
} from "@/lib/jobs/jobCardDecisionSignals";
import type { PublicJobRow } from "@/lib/jobs/publicJob";
import {
  getPublicListingProbabilityPreview,
  getPublicVacancyAdvanceBullets,
  getPublicVacancyResponseNarrative,
  orderJobsForPublicExploration,
  publicJobListingStarScore,
  publicListingSignalLine,
} from "@/lib/jobs/publicJobListingPreview";
import {
  buildAnonymousJobBreakdownPreview,
  computeJobRequirementBreakdown,
} from "@/lib/jobs/jobRequirementBreakdown";
import {
  alignmentSummaryFromTier,
  applyJobCardCtaLabel,
  getBreakdownNarrativeSummary,
  getProbabilityPresentation,
  getProbabilityPresentationFromRequirementBreakdown,
} from "@/lib/jobs/responseProbabilityUi";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type JobListing = PublicJobRow & JobListingRow;

type CandidateProfile = CandidateMatchProfile & {
  summary?: string | null;
  industries?: string | null;
  years_experience?: number | null;
};

type ApplicationAction = "saved" | "applied";

type HiddenUndoState = { jobId: string; title: string };

type PublicJobsExplorerProps = {
  initialJobs: PublicJobRow[];
  loadError?: string | null;
};

function toSkillList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (Array.isArray(value)) {
    return value.map((item) => norm(item)).filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => norm(item))
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
      tools: "",
      industries: candidate.industries ?? "",
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

function stopCardNavigation(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function PublicJobsExplorer({
  initialJobs,
  loadError,
}: PublicJobsExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobFromUrl = searchParams.get("job");

  const initialSearchJobIdRef = useRef<string | null | undefined>(undefined);
  if (initialSearchJobIdRef.current === undefined) {
    initialSearchJobIdRef.current = searchParams.get("job");
  }

  const [authChecked, setAuthChecked] = useState(false);
  const [sessionKind, setSessionKind] = useState<"anon" | "candidate">("anon");
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [jobs, setJobs] = useState<JobListing[]>(initialJobs as JobListing[]);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [applicationStatusByJob, setApplicationStatusByJob] =
    useState<ApplicationStatusMap>({});
  const [viewedJobIds, setViewedJobIds] = useState<Set<string>>(new Set());
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [hideLoadingByJob, setHideLoadingByJob] = useState<Record<string, boolean>>(
    {},
  );
  const [hiddenUndo, setHiddenUndo] = useState<HiddenUndoState | null>(null);
  const hiddenUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [listSortMode, setListSortMode] = useState<JobsListSortMode>("prioritized");
  const [modalOpen, setModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});

  const [aiMatchByJobId, setAiMatchByJobId] = useState<Record<string, MatchAnalysis>>(
    {},
  );
  const persistedViewKeysRef = useRef<Set<string>>(new Set());
  const viewSourceRef = useRef<"split_view_selection" | "auto_select">("auto_select");

  const isCandidate = sessionKind === "candidate" && candidate !== null;

  const rankedJobs = useMemo(() => {
    if (isCandidate) {
      return orderJobsWithCandidateRanking(
        jobs,
        candidate,
        hiddenJobIds,
        applicationStatusByJob,
        viewedJobIds,
      );
    }
    return orderJobsForPublicExploration(jobs);
  }, [
    isCandidate,
    jobs,
    candidate,
    hiddenJobIds,
    applicationStatusByJob,
    viewedJobIds,
  ]);

  const displayJobs = useMemo(() => {
    if (listSortMode === "all") {
      return orderJobsChronological(jobs, hiddenJobIds);
    }
    return rankedJobs;
  }, [listSortMode, jobs, hiddenJobIds, rankedJobs]);

  const selectedJob =
    displayJobs.find((j) => j.id === selectedJobId) ?? displayJobs[0] ?? null;

  useEffect(() => {
    return () => {
      if (hiddenUndoTimerRef.current) clearTimeout(hiddenUndoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) {
          setSessionKind("anon");
          setAuthChecked(true);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (cancelled) return;

        const role = profile?.role as string | undefined;
        if (role === "recruiter") {
          router.replace("/recruiter/dashboard");
          return;
        }
        if (role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }
        if (role !== "candidate") {
          setSessionKind("anon");
          setAuthChecked(true);
          return;
        }

        setSessionKind("candidate");
        setCandidateLoading(true);

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

        if (jobsRes.error || candidateRes.error) {
          setSessionKind("anon");
          setJobs(initialJobs as JobListing[]);
          setCandidate(null);
          setCandidateLoading(false);
          setAuthChecked(true);
          return;
        }

        const candidateProfile = candidateRes.data?.[0] ?? null;
        setJobs((jobsRes.data ?? []) as JobListing[]);
        setCandidate(candidateProfile as CandidateProfile | null);

        const candidateEmail = candidateProfile?.email?.trim();
        const candidateId = candidateProfile?.id;
        if (candidateEmail || candidateId) {
          const [
            { data: applicationsData, error: applicationsError },
            { data: viewsData, error: viewsError },
            { data: hiddenData, error: hiddenError },
          ] = await Promise.all([
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

          if (!cancelled && !applicationsError && !viewsError && !hiddenError) {
            setApplicationStatusByJob(
              deriveJobApplicationStateMap(
                (applicationsData ?? []).map((item) => ({
                  job_id: (item.job_id as string | null) ?? null,
                  status: (item.status as string | null) ?? null,
                })),
              ),
            );
            setViewedJobIds(
              new Set(
                (viewsData ?? [])
                  .map((item) => String(item.job_id ?? ""))
                  .filter(Boolean),
              ),
            );
            setHiddenJobIds(
              new Set(
                (hiddenData ?? [])
                  .map((item) => String(item.job_id ?? ""))
                  .filter(Boolean),
              ),
            );
          }
        } else {
          setApplicationStatusByJob({});
          setViewedJobIds(new Set());
          setHiddenJobIds(new Set());
        }

        setCandidateLoading(false);
        setAuthChecked(true);
      } catch {
        if (!cancelled) {
          setSessionKind("anon");
          setJobs(initialJobs as JobListing[]);
          setCandidate(null);
          setCandidateLoading(false);
          setAuthChecked(true);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only; initialJobs from SSR snapshot

  useEffect(() => {
    if (!authChecked) return;
    if (displayJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    const valid = jobFromUrl && displayJobs.some((j) => j.id === jobFromUrl);
    if (valid) {
      setSelectedJobId(jobFromUrl);
      return;
    }
    const first = displayJobs[0].id;
    setSelectedJobId(first);
    if (jobFromUrl !== first) {
      router.replace(`/jobs?job=${encodeURIComponent(first)}`, { scroll: false });
    }
  }, [authChecked, displayJobs, jobFromUrl, router]);

  useEffect(() => {
    if (!authChecked || displayJobs.length === 0) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const initial = initialSearchJobIdRef.current;
    if (initial && displayJobs.some((j) => j.id === initial)) {
      setMobileShowDetail(true);
    }
  }, [authChecked, displayJobs]);

  useEffect(() => {
    async function persistViewedJob() {
      const candidateId = candidate?.id ?? null;
      const jobId = selectedJobId ?? null;
      if (!candidateId || !jobId) return;

      const key = `${candidateId}:${jobId}`;
      if (persistedViewKeysRef.current.has(key)) return;

      persistedViewKeysRef.current.add(key);
      setViewedJobIds((prev) => {
        const next = new Set(prev);
        next.add(jobId);
        return next;
      });

      const supabase = getSupabaseBrowserClient();
      await supabase.from("candidate_job_views").upsert(
        {
          candidate_id: candidateId,
          job_id: jobId,
          viewed_at: new Date().toISOString(),
        },
        { onConflict: "candidate_id,job_id", ignoreDuplicates: true },
      );
    }
    if (isCandidate) void persistViewedJob();
  }, [candidate?.id, isCandidate, selectedJobId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAiMatchAnalysis() {
      if (!isCandidate || !candidate || rankedJobs.length === 0) return;

      const topJobs = rankedJobs.slice(0, 12);
      const selected = selectedJobId
        ? (rankedJobs.find((job) => job.id === selectedJobId) ?? null)
        : null;
      const jobsToAnalyze = selected
        ? [...topJobs, selected].filter(
            (job, index, arr) => arr.findIndex((item) => item.id === job.id) === index,
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
            /* fallback */
          }
        }),
      );
    }

    void hydrateAiMatchAnalysis();
    return () => {
      cancelled = true;
    };
  }, [isCandidate, candidate, rankedJobs, selectedJobId]); // eslint-disable-line react-hooks/exhaustive-deps -- batch updates `aiMatchByJobId`

  const selectJob = useCallback(
    (id: string, fromMobileList?: boolean) => {
      viewSourceRef.current = "split_view_selection";
      setSelectedJobId(id);
      if (fromMobileList) setMobileShowDetail(true);
      router.replace(`/jobs?job=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  const backToJobListMobile = useCallback(() => {
    setMobileShowDetail(false);
    router.replace("/jobs", { scroll: false });
  }, [router]);

  async function handleHideJob(job: JobListing) {
    const candidateId = candidate?.id ?? null;
    if (!candidateId) return;

    setHideLoadingByJob((prev) => ({ ...prev, [job.id]: true }));
    setHiddenJobIds((prev) => {
      const next = new Set(prev);
      next.add(job.id);
      return next;
    });

    if (hiddenUndoTimerRef.current) clearTimeout(hiddenUndoTimerRef.current);
    setHiddenUndo({ jobId: job.id, title: job.title ?? "Vacante" });
    hiddenUndoTimerRef.current = setTimeout(() => {
      setHiddenUndo((prev) => (prev?.jobId === job.id ? null : prev));
      hiddenUndoTimerRef.current = null;
    }, 5000);

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("candidate_hidden_jobs").upsert(
        {
          candidate_id: candidateId,
          job_id: job.id,
          hidden_at: new Date().toISOString(),
        },
        { onConflict: "candidate_id,job_id", ignoreDuplicates: true },
      );
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
    await supabase
      .from("candidate_hidden_jobs")
      .delete()
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId);
  }

  async function handleApplicationAction(job: JobListing, action: ApplicationAction) {
    if (!isCandidate) {
      savePostLoginJobRedirect(job.id);
      setModalOpen(true);
      return;
    }

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
            message:
              action === "saved" ? "Esta vacante ya está guardada." : "Ya estás postulado.",
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
            err instanceof Error ? err.message : "Error inesperado al registrar la acción.",
        },
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  function renderJobListCard(job: JobListing, layout: "mobile" | "split") {
    const saveKey = `${job.id}:saved`;
    const applyKey = `${job.id}:applied`;

    const publicPreview = getPublicListingProbabilityPreview(job);
    const publicStar = publicJobListingStarScore(job);
    const publicBullets = getPublicVacancyAdvanceBullets(job, 3);

    const matchScore = calculateMatchScore(job, candidate);
    const aiMatch = aiMatchByJobId[job.id] ?? null;
    const requirementBreakdown =
      isCandidate && candidate
        ? computeJobRequirementBreakdown(job, {
            target_role: candidate.target_role,
            skills: candidate.skills,
            years_experience: candidate.years_experience ?? null,
          })
        : null;
    const authProbability = requirementBreakdown
      ? getProbabilityPresentationFromRequirementBreakdown(requirementBreakdown.tier, aiMatch)
      : getProbabilityPresentation(aiMatch, matchScore);

    const probability = isCandidate
      ? {
          tier: authProbability.tier,
          label: authProbability.label,
          badgeClass: authProbability.badgeClass,
        }
      : {
          tier: publicPreview.tier,
          label: publicPreview.label,
          badgeClass: publicPreview.badgeClass,
        };

    const meta = getJobCardMetaLines(job);
    const whyBullets = isCandidate
      ? getJobCardWhyBullets(job, candidateForJobCard(candidate), {
          aiStrengths: aiMatch?.strengths,
        })
      : publicBullets;

    const competenceLine =
      isCandidate && requirementBreakdown
        ? alignmentSummaryFromTier(requirementBreakdown.tier).headline
        : publicListingSignalLine(publicStar);

    const state = applicationStatusByJob[job.id] ?? { saved: false, applied: false };
    const isSelected = selectedJob?.id === job.id;
    const isApplied = state.applied;
    const isSaved = state.saved;
    const isViewed = viewedJobIds.has(job.id);
    const postedAge = getPostedAgeLabel(job.created_at);

    const cardStateLabel = isApplied
      ? "Postulado"
      : isSaved
        ? "Guardada"
        : isViewed
          ? "Visto"
          : null;

    const inner = (
      <>
        {isCandidate ? (
          <button
            type="button"
            aria-label="Ocultar vacante"
            onClick={(e) => {
              stopCardNavigation(e);
              void handleHideJob(job);
            }}
            disabled={hideLoadingByJob[job.id] === true}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm text-zinc-500 opacity-0 transition hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-60 group-hover:opacity-100"
          >
            {hideLoadingByJob[job.id] ? "…" : "×"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => selectJob(job.id, layout === "mobile")}
          className="w-full pr-8 text-left"
        >
          <span
            className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ${probability.badgeClass}`}
          >
            {probability.label}
          </span>
          {!isCandidate ? (
            <p className="mt-1 text-[10px] leading-snug text-[#64748B]">
              {publicPreview.previewNote}
            </p>
          ) : null}
          <p className="mt-2 text-base font-semibold leading-tight text-[#0F172A]">
            {job.title ?? "Sin título"}
          </p>
          <p className="mt-1 text-xs text-[#475569]">
            {job.company_name ?? "Empresa no especificada"}
          </p>
          <p className="mt-1.5 text-[11px] leading-tight text-[#64748B]">
            {meta.ubicacion} · {meta.modalidad}
          </p>
          <p className="text-[11px] leading-tight text-[#64748B]">{meta.salario}</p>
          <p className="mt-1.5 text-[11px] font-medium text-[#334155]">{competenceLine}</p>
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
          {postedAge ? <p className="mt-2 text-xs text-[#94A3B8]">{postedAge}</p> : null}
        </button>

        <div className="mt-3 border-t border-zinc-100 pt-3">
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
          <div className="mt-3">
            <Button
              variant={isApplied ? "secondary" : "primary"}
              type="button"
              className="w-full"
              onClick={(e) => {
                stopCardNavigation(e);
                void handleApplicationAction(job, "applied");
              }}
              disabled={isCandidate && (actionLoading[applyKey] === true || isApplied)}
            >
              {applyJobCardCtaLabel(
                isApplied,
                isCandidate ? actionLoading[applyKey] === true : false,
              )}
            </Button>
          </div>
          {isCandidate && !isApplied ? (
            <Button
              variant="secondary"
              type="button"
              className="mt-2 w-full"
              onClick={(e) => {
                stopCardNavigation(e);
                void handleApplicationAction(job, "saved");
              }}
              disabled={actionLoading[saveKey] === true || isSaved}
            >
              {actionLoading[saveKey] ? "Guardando..." : isSaved ? "Guardada" : "Guardar"}
            </Button>
          ) : null}
        </div>
      </>
    );

    if (layout === "split") {
      return (
        <article
          key={job.id}
          className={`group relative rounded-2xl border p-4 text-left transition ${
            isSelected
              ? "border-[#4F46E5] bg-[#EEF2FF] shadow-sm"
              : "border-zinc-200 bg-white hover:border-zinc-300"
          }`}
        >
          {inner}
        </article>
      );
    }

    return (
      <article
        key={job.id}
        className="group relative rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        {inner}
      </article>
    );
  }

  function renderDetailPanel(job: JobListing) {
    const publicPreview = getPublicListingProbabilityPreview(job);
    const publicStar = publicJobListingStarScore(job);
    const publicBullets = getPublicVacancyAdvanceBullets(job, 3);
    const publicNarrative = getPublicVacancyResponseNarrative(publicStar);

    const matchScore = calculateMatchScore(job, candidate);
    const aiMatch = aiMatchByJobId[job.id] ?? null;
    const detailRequirementBreakdown =
      isCandidate && candidate
        ? computeJobRequirementBreakdown(job, {
            target_role: candidate.target_role,
            skills: candidate.skills,
            years_experience: candidate.years_experience ?? null,
          })
        : null;
    const authProbability = detailRequirementBreakdown
      ? getProbabilityPresentationFromRequirementBreakdown(detailRequirementBreakdown.tier, aiMatch)
      : getProbabilityPresentation(aiMatch, matchScore);

    const detailBadgeLabel = isCandidate ? authProbability.label : publicPreview.label;

    const detailBadgeClass = isCandidate
      ? authProbability.badgeClass
      : publicPreview.badgeClass;

    const anonymousBreakdownPreview = buildAnonymousJobBreakdownPreview(job);

    const whyBullets = isCandidate
      ? getJobCardWhyBullets(job, candidateForJobCard(candidate), {
          aiStrengths: aiMatch?.strengths,
          max: 5,
        })
      : publicBullets;

    const meta = getJobCardMetaLines(job);
    const state = applicationStatusByJob[job.id] ?? { saved: false, applied: false };
    const isSaved = state.saved;
    const isApplied = state.applied;
    const saveKey = `${job.id}:saved`;
    const applyKey = `${job.id}:applied`;

    return (
      <article className="ds-card h-full min-h-0 overflow-y-auto p-6 lg:p-8">
        <div className="flex flex-col gap-7">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-5">
            <div>
              <h2 className="ds-heading text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                {job.title ?? "Vacante sin título"}
              </h2>
              <p className="mt-2 text-sm text-[#475569]">
                {job.company_name ?? "Empresa no especificada"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold tracking-tight ${detailBadgeClass}`}
              >
                {detailBadgeLabel}
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
                <dd>{meta.ubicacion}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-[#475569]">Modalidad</dt>
                <dd>{meta.modalidad}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-[#475569]">Salario</dt>
                <dd>{meta.salario}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm font-medium text-[#334155]">
              {isCandidate && detailRequirementBreakdown
                ? alignmentSummaryFromTier(detailRequirementBreakdown.tier).headline
                : publicListingSignalLine(publicStar)}
            </p>
          </div>

          {isCandidate && detailRequirementBreakdown ? (
            <JobRequirementBreakdown
              variant="authenticated"
              cumplesCon={detailRequirementBreakdown.cumplesCon}
              teFalta={detailRequirementBreakdown.teFalta}
            />
          ) : (
            <JobRequirementBreakdown
              variant="anonymous"
              cumplesCon={anonymousBreakdownPreview.cumplesCon}
              teFalta={anonymousBreakdownPreview.teFalta}
              footnote={anonymousBreakdownPreview.footnote}
            />
          )}

          {isCandidate && aiMatch ? (
            <section className="rounded-xl border border-zinc-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">
                Señales para tu postulación
              </h3>
              <p className="mt-1 text-sm text-[#475569]">{aiMatch.summary}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Fortalezas
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                    {aiMatch.strengths.map((item, idx) => (
                      <li key={`${item}-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Brechas
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                    {aiMatch.gaps.map((item, idx) => (
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
              {isCandidate && detailRequirementBreakdown
                ? getBreakdownNarrativeSummary(detailRequirementBreakdown.tier)
                : publicNarrative}
            </p>
            {!isCandidate ? (
              <p className="mt-3 text-xs text-[#94A3B8]">
                Con una sesión de candidato verás el desglose comparado con tu perfil.
              </p>
            ) : null}
          </section>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Descripción
            </p>
            <p className="text-sm leading-relaxed text-[#0F172A]">
              {job.description ?? "Sin descripción."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Habilidades requeridas
            </p>
            {toSkillList(job.required_skills).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {toSkillList(job.required_skills).map((skill, skillIndex) => (
                  <span
                    key={`${skill}-${skillIndex}`}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {formatSkillLabelEs(skill)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#475569]">No especificadas para esta vacante.</p>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <div className="rounded-2xl bg-[#F8FAFF] p-3 sm:p-4">
            <p className="text-sm font-medium text-[#334155]">{detailBadgeLabel}</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#475569]">
              {whyBullets.slice(0, 3).map((line, idx) => (
                <li key={`${job.id}-footer-ctx-${idx}`} className="flex gap-2">
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
                onClick={() => void handleApplicationAction(job, "applied")}
                disabled={isCandidate && (actionLoading[applyKey] === true || isApplied)}
                className={
                  isApplied
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800 opacity-100 hover:border-emerald-300 hover:bg-emerald-100"
                    : "sm:order-2"
                }
              >
                {applyJobCardCtaLabel(
                  isApplied,
                  isCandidate ? actionLoading[applyKey] === true : false,
                )}
              </Button>
              {isCandidate && !isApplied ? (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void handleApplicationAction(job, "saved")}
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
              <p className="mt-2 text-xs text-emerald-700">Ya postulaste a esta vacante.</p>
            ) : isSaved ? (
              <p className="mt-2 text-xs text-slate-600">Vacante guardada para revisar después.</p>
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
  }

  if (!authChecked || candidateLoading) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-8 sm:py-14">
        <EmptyState title="No pudimos cargar vacantes" description={loadError} />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-8 sm:py-14">
        <EmptyState
          title="No hay vacantes por ahora"
          description="Vuelve pronto o entra para crear tu perfil y recibir alertas."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
      <div>
        <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-[#0F172A]">
          ← Inicio
        </Link>
      </div>

      <PageHeader
        title="Vacantes"
        description="Explora con el mismo listado y detalle que en tu cuenta. Solo te pedimos correo cuando quieras postularte."
      />

      <JobsSmartListHeader mode={listSortMode} onModeChange={setListSortMode} />

      <section className="grid gap-4 md:hidden">
        {!mobileShowDetail ? (
          <>
            <div className="grid gap-3">{displayJobs.map((j) => renderJobListCard(j, "mobile"))}</div>
          </>
        ) : selectedJob ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={backToJobListMobile}
              className="self-start text-sm font-medium text-[#4F46E5] hover:underline"
            >
              ← Volver a vacantes
            </button>
            {renderDetailPanel(selectedJob)}
          </div>
        ) : null}
      </section>

      <section className="hidden gap-6 overflow-hidden md:grid md:h-[calc(100vh-250px)] md:min-h-0 md:grid-cols-[clamp(360px,32vw,420px)_minmax(0,1fr)]">
        <aside className="ds-card flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-3">{displayJobs.map((j) => renderJobListCard(j, "split"))}</div>
          </div>
        </aside>
        {selectedJob ? (
          renderDetailPanel(selectedJob)
        ) : (
          <div className="ds-card h-full min-h-0 overflow-y-auto p-6">
            <EmptyState
              title="Selecciona una vacante"
              description="Elige una vacante de la lista para ver su detalle."
            />
          </div>
        )}
      </section>

      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {hiddenUndo && isCandidate ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 w-[min(92vw,360px)]">
          <div className="pointer-events-auto ds-card border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0F172A]">Vacante oculta</p>
                <p className="mt-1 truncate text-xs text-[#64748B]">{hiddenUndo.title}</p>
              </div>
              <Button variant="secondary" type="button" onClick={() => void handleUndoHide()}>
                Deshacer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
