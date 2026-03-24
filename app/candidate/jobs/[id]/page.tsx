"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { JobRequirementBreakdown } from "@/components/jobs/JobRequirementBreakdown";
import {
  getJobMatchAnalysis,
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { deriveJobApplicationStateMap } from "@/lib/candidate/application-state";
import {
  getJobCardWhyBullets,
} from "@/lib/jobs/jobCardDecisionSignals";
import { computeJobRequirementBreakdown } from "@/lib/jobs/jobRequirementBreakdown";
import {
  alignmentSummaryFromTier,
  applyPrimaryCtaLabel,
  getProbabilityPresentation,
  getProbabilityPresentationFromRequirementBreakdown,
} from "@/lib/jobs/responseProbabilityUi";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type JobDetail = {
  id: string;
  title: string | null;
  company_name: string | null;
  city: string | null;
  work_mode: string | null;
  salary_range: string | null;
  description: string | null;
  required_skills: string | string[] | null;
};

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

type PageStatus = "loading" | "success" | "error" | "not_found";
type Action = "saved" | "applied";

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

function isRemote(workMode: string | null) {
  if (!workMode) return false;
  const mode = normalize(workMode);
  return mode.includes("remoto") || mode.includes("remote");
}

function getLocationWorkModeLine(city: string | null, workMode: string | null) {
  if (isRemote(workMode)) return "Remoto";
  if (city && workMode) return `${city} • ${workMode}`;
  if (city) return city;
  if (workMode) return workMode;
  return null;
}

function formatSalaryDisplay(salaryRange: string | null) {
  if (!salaryRange) return null;
  return salaryRange.replace(/\s*-\s*/g, " – ").trim();
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

function candidateForJobCard(c: CandidateProfile | null) {
  if (!c) return null;
  return {
    target_role: c.target_role,
    skills: c.skills,
    industries: c.industries,
    years_experience: c.years_experience,
  };
}

function buildMatchPayload(job: JobDetail, candidate: CandidateProfile) {
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

export default function CandidateJobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = typeof params?.id === "string" ? params.id : "";

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [candidateEmail, setCandidateEmail] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [loadingAction, setLoadingAction] = useState<Record<Action, boolean>>({
    saved: false,
    applied: false,
  });
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [aiMatchAnalysis, setAiMatchAnalysis] = useState<MatchAnalysis | null>(null);
  const persistedViewKeysRef = useRef<Set<string>>(new Set());

  const renderedSkills = useMemo(() => toSkillList(job?.required_skills), [job]);
  const requirementBreakdown = useMemo(() => {
    if (!job || !candidateProfile) return null;
    return computeJobRequirementBreakdown(job, {
      target_role: candidateProfile.target_role,
      skills: candidateProfile.skills,
      years_experience: candidateProfile.years_experience ?? null,
    });
  }, [job, candidateProfile]);
  const locationModeLine = useMemo(
    () => getLocationWorkModeLine(job?.city ?? null, job?.work_mode ?? null),
    [job?.city, job?.work_mode]
  );
  const probabilityPresentation = useMemo(() => {
    if (requirementBreakdown) {
      return getProbabilityPresentationFromRequirementBreakdown(
        requirementBreakdown.tier,
        aiMatchAnalysis,
      );
    }
    return getProbabilityPresentation(aiMatchAnalysis, 0);
  }, [aiMatchAnalysis, requirementBreakdown]);
  const alignmentPresentation = useMemo(() => {
    if (requirementBreakdown) {
      return alignmentSummaryFromTier(requirementBreakdown.tier);
    }
    return {
      headline: "Comparación con el anuncio",
      subline: "Completa tu perfil para ver el desglose frente a esta vacante.",
    };
  }, [requirementBreakdown]);
  const applyContextBullets = useMemo(
    () =>
      job
        ? getJobCardWhyBullets(job, candidateForJobCard(candidateProfile), {
            aiStrengths: aiMatchAnalysis?.strengths,
            max: 5,
          })
        : [],
    [job, candidateProfile, aiMatchAnalysis?.strengths],
  );

  useEffect(() => {
    let mounted = true;

    async function loadJobDetail() {
      if (!jobId) {
        setStatus("not_found");
        return;
      }

      setStatus("loading");
      setErrorMessage(null);
      setFeedback(null);
      setAiMatchAnalysis(null);

      try {
        const supabase = getSupabaseBrowserClient();

        const { data: jobData, error: jobError } = await supabase
          .from("job_listings")
          .select(
            "id, title, company_name, city, work_mode, salary_range, description, required_skills"
          )
          .eq("id", jobId)
          .maybeSingle();

        if (!mounted) return;

        if (jobError) {
          setStatus("error");
          setErrorMessage(jobError.message);
          return;
        }

        if (!jobData) {
          setStatus("not_found");
          return;
        }

        setJob({
          id: String(jobData.id),
          title: (jobData.title as string | null) ?? null,
          company_name: (jobData.company_name as string | null) ?? null,
          city: (jobData.city as string | null) ?? null,
          work_mode: (jobData.work_mode as string | null) ?? null,
          salary_range: (jobData.salary_range as string | null) ?? null,
          description: (jobData.description as string | null) ?? null,
          required_skills: (jobData.required_skills as string | string[] | null) ?? null,
        });

        const { data: profileData, error: profileError } = await supabase
          .from("candidate_profiles")
          .select(
            "id, email, target_role, work_mode, skills, city, expected_salary, summary, industries, years_experience",
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;

        if (profileError) {
          setStatus("error");
          setErrorMessage(profileError.message);
          return;
        }

        const profile = profileData
          ? {
              id: String(profileData.id),
              email: (profileData.email as string | null) ?? null,
              target_role: (profileData.target_role as string | null) ?? null,
              work_mode: (profileData.work_mode as string | null) ?? null,
              skills: (profileData.skills as string | null) ?? null,
              city: (profileData.city as string | null) ?? null,
              expected_salary: (profileData.expected_salary as number | null) ?? null,
              summary: (profileData.summary as string | null | undefined) ?? null,
              industries: (profileData.industries as string | null | undefined) ?? null,
              years_experience:
                typeof profileData.years_experience === "number"
                  ? profileData.years_experience
                  : null,
            }
          : null;
        setCandidateProfile(profile);

        const email = profile?.email?.trim() ?? null;
        setCandidateEmail(email);

        if (email) {
          const { data: appsData, error: appsError } = await supabase
            .from("applications")
            .select("status")
            .eq("candidate_email", email)
            .eq("job_id", jobId)
            .in("status", ["saved", "applied"]);

          if (!mounted) return;

          if (appsError) {
            setStatus("error");
            setErrorMessage(appsError.message);
            return;
          }

          const stateMap = deriveJobApplicationStateMap(
            (appsData ?? []).map((item) => ({
              job_id: jobId,
              status: (item.status as string | null) ?? null,
            }))
          );
          const jobState = stateMap[jobId] ?? { saved: false, applied: false };
          setSaved(jobState.saved);
          setApplied(jobState.applied);
        } else {
          setSaved(false);
          setApplied(false);
        }

        setStatus("success");
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Error inesperado cargando la vacante."
        );
      }
    }

    void loadJobDetail();
    return () => {
      mounted = false;
    };
  }, [jobId]);

  useEffect(() => {
    async function persistViewedJob() {
      const candidateId = candidateProfile?.id ?? null;
      const jobIdForView = job?.id ?? null;
      const flow = "standalone_detail";

      if (!candidateId || !jobIdForView) {
        console.warn("[job-detail] skip viewed persist: missing candidate_id or job_id", {
          flow,
          candidate_id: candidateId,
          job_id: jobIdForView,
        });
        return;
      }

      const key = `${candidateId}:${jobIdForView}`;
      if (persistedViewKeysRef.current.has(key)) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[job-detail] skip viewed persist: already persisted for key", {
            flow,
            candidate_id: candidateId,
            job_id: jobIdForView,
            key,
          });
        }
        return;
      }
      persistedViewKeysRef.current.add(key);

      const payload = {
        candidate_id: candidateId,
        job_id: jobIdForView,
        viewed_at: new Date().toISOString(),
      };
      if (process.env.NODE_ENV !== "production") {
        console.info("[job-detail] persisting viewed state", {
          flow,
          candidate_id: candidateId,
          job_id: jobIdForView,
          payload,
        });
      }

      const supabase = getSupabaseBrowserClient();
      const response = await supabase.from("candidate_job_views").upsert(payload, {
        onConflict: "candidate_id,job_id",
        ignoreDuplicates: true,
      });
      const { error } = response;

      if (process.env.NODE_ENV !== "production") {
        console.info("[job-detail] viewed persist response", {
          flow,
          candidate_id: candidateId,
          job_id: jobIdForView,
          error,
        });
      }

      if (error) {
        const isDuplicateConflict = error.code === "23505";
        if (isDuplicateConflict) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[job-detail] duplicate viewed row ignored", {
              flow,
              candidate_id: candidateId,
              job_id: jobIdForView,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            });
          }
          return;
        }

        // Allow retry when detail page is opened again.
        persistedViewKeysRef.current.delete(key);
        console.warn("[job-detail] viewed persist failed (non-critical)", {
          flow,
          candidate_id: candidateId,
          job_id: jobIdForView,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }
    }

    void persistViewedJob();
  }, [candidateProfile?.id, job?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadAiAnalysis() {
      if (!job || !candidateProfile) return;
      try {
        const analysis = await getJobMatchAnalysis(buildMatchPayload(job, candidateProfile));
        if (cancelled) return;
        setAiMatchAnalysis(analysis);
      } catch {
        if (cancelled) return;
        setAiMatchAnalysis(null);
      }
    }

    void loadAiAnalysis();
    return () => {
      cancelled = true;
    };
  }, [job, candidateProfile]);

  async function handleAction(action: Action) {
    if (!job) return;
    setFeedback(null);

    if (!candidateEmail) {
      setFeedback({
        type: "error",
        message: "No encontramos tu email de candidato. Completa tu perfil primero.",
      });
      return;
    }

    if (action === "saved" && (saved || applied)) {
      setFeedback({
        type: "success",
        message: applied ? "Ya estás postulado a esta vacante." : "Esta vacante ya está guardada.",
      });
      return;
    }

    if (action === "applied" && applied) {
      setFeedback({
        type: "success",
        message: "Ya estás postulado a esta vacante.",
      });
      return;
    }

    setLoadingAction((prev) => ({ ...prev, [action]: true }));

    try {
      const supabase = getSupabaseBrowserClient();

      const { data: existing, error: existingError } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_email", candidateEmail)
        .eq("job_id", job.id)
        .eq("status", action)
        .limit(1);

      if (existingError) {
        setFeedback({ type: "error", message: existingError.message });
        return;
      }

      if ((existing ?? []).length > 0) {
        if (action === "saved") setSaved(true);
        if (action === "applied") setApplied(true);
        setFeedback({
          type: "success",
          message:
            action === "saved"
              ? "Esta vacante ya está guardada."
              : "Ya estabas postulado a esta vacante.",
        });
        return;
      }

      const { error: insertError } = await supabase.from("applications").insert({
        candidate_email: candidateEmail,
        job_id: job.id,
        status: action,
      });

      if (insertError) {
        setFeedback({ type: "error", message: insertError.message });
        return;
      }

      if (action === "saved") setSaved(true);
      if (action === "applied") setApplied(true);

      setFeedback({
        type: "success",
        message:
          action === "saved"
            ? "Vacante guardada correctamente."
            : "Postulación registrada correctamente.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error inesperado al registrar la acción.",
      });
    } finally {
      setLoadingAction((prev) => ({ ...prev, [action]: false }));
    }
  }

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error") {
    return (
      <EmptyState
        title="No pudimos cargar esta vacante"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  }

  if (status === "not_found" || !job) {
    return (
      <EmptyState
        title="Vacante no encontrada"
        description="Es posible que esta vacante ya no este disponible o haya sido cerrada."
        action={
          <Link href="/candidate/jobs">
            <Button variant="secondary">Volver a vacantes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/candidate/jobs" className="text-sm text-[#475569] hover:text-[#0F172A]">
        ← Volver a vacantes
      </Link>

      <PageHeader
        title={job.title ?? "Vacante sin título"}
        description={job.company_name ?? "Empresa no especificada"}
      />

      <section className="ds-card p-6 lg:p-7">
        <div className="flex flex-col gap-7">
          <div className="rounded-xl border border-zinc-100 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${probabilityPresentation.badgeClass}`}
              >
                {probabilityPresentation.label}
              </span>
              {applied ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  Postulado
                </span>
              ) : saved ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Guardada
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-[#475569]">
              <span className="font-semibold text-[#0F172A]">{alignmentPresentation.headline}</span>
              {" — "}
              {alignmentPresentation.subline}
            </p>
            <div className="mt-3 space-y-1 text-sm text-[#475569]">
              {locationModeLine ? <p>{locationModeLine}</p> : null}
              {job.salary_range ? <p>{formatSalaryDisplay(job.salary_range)}</p> : null}
            </div>
          </div>

          {requirementBreakdown ? (
            <JobRequirementBreakdown
              variant="authenticated"
              cumplesCon={requirementBreakdown.cumplesCon}
              teFalta={requirementBreakdown.teFalta}
            />
          ) : null}

          {aiMatchAnalysis ? (
            <section className="rounded-xl border border-zinc-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Contexto adicional (IA)</h3>
              <p className="mt-1 text-sm text-[#475569]">{aiMatchAnalysis.summary}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Coincidencias (IA)
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                    {aiMatchAnalysis.strengths.map((item, idx) => (
                      <li key={`${item}-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Diferencias (IA)
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-[#334155]">
                    {aiMatchAnalysis.gaps.map((item, idx) => (
                      <li key={`${item}-${idx}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Descripción
            </p>
            <p className="text-sm leading-relaxed text-[#0F172A]">
              {job.description ?? "Sin descripción."}
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Habilidades requeridas
            </p>
            {renderedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {renderedSkills.map((skill, index) => (
                  <span
                    key={`${skill}-${index}`}
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

        <div className="mt-1 border-t border-zinc-100 pt-5">
          <div className="rounded-2xl bg-[#F8FAFF] p-3 sm:p-4">
            <p className="text-sm font-medium text-[#334155]">
              {probabilityPresentation.label}
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#475569]">
              {applyContextBullets.slice(0, 3).map((line, idx) => (
                <li key={`apply-ctx-${idx}`} className="flex gap-2">
                  <span className="shrink-0 text-[#94A3B8]" aria-hidden>
                    ·
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant={applied ? "secondary" : "primary"}
                type="button"
                onClick={() => void handleAction("applied")}
                disabled={loadingAction.applied || applied}
                className={
                  applied
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50"
                    : "sm:order-2"
                }
              >
                {applyPrimaryCtaLabel(
                  probabilityPresentation.tier,
                  applied,
                  loadingAction.applied
                )}
              </Button>
            {!applied ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleAction("saved")}
                disabled={loadingAction.saved || saved}
                className="sm:order-1"
              >
                {loadingAction.saved ? "Guardando..." : saved ? "Guardada" : "Guardar"}
              </Button>
            ) : null}
            </div>
          </div>
        </div>

        {feedback ? (
          <p
            className={`mt-4 text-sm ${
              feedback.type === "success" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

