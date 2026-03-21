"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { normalizeApplicationStatus } from "@/lib/candidate/application-state";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type CandidateProfile = {
  id: string;
  email: string | null;
  city: string | null;
  target_role: string | null;
  skills: string | null;
  expected_salary: number | null;
  work_mode: string | null;
};

type Status = "idle" | "loading" | "success" | "error";

type ApplicationStatus = "saved" | "applied";
type InteractionStatus = ApplicationStatus | "viewed";

type ApplicationRow = {
  job_id: string | null;
  status: ApplicationStatus;
  created_at: string | null;
};

type ViewedRow = {
  job_id: string | null;
  viewed_at: string | null;
};

type JobListing = {
  id: string;
  title: string | null;
  company_name: string | null;
  city: string | null;
  work_mode: string | null;
  salary_range: string | null;
  required_skills: string | string[] | null;
  created_at: string | null;
};

type RecentItem = {
  job_id: string;
  status: InteractionStatus;
  timestamp: string | null;
  title: string;
  company_name: string;
};

type Summary = {
  viewed: number;
  saved: number;
  applied: number;
};

type Insights = {
  goodMatchApplications: number;
  savedToAppliedRate: number;
  highMatchViewedRecently: number;
};

function formatDate(value: string | null) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString();
}

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

function parseSalaryRange(salaryRange: string | null) {
  if (!salaryRange) return null;
  const numbers = salaryRange
    .replace(/\./g, "")
    .match(/\d+(?:,\d+)?/g)
    ?.map((n) => Number(n.replace(",", ".")));

  if (!numbers || numbers.length === 0) return null;
  if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

function isRemote(workMode: string | null) {
  if (!workMode) return false;
  const mode = normalize(workMode);
  return mode.includes("remoto") || mode.includes("remote");
}

function calculateMatchScore(job: JobListing, candidate: CandidateProfile | null) {
  if (!candidate) return 0;

  let score = 0;

  if (roleMatchesClosely(candidate.target_role, job.title)) {
    score += 1;
  }

  const candidateSkills = toSkillList(candidate.skills);
  const requiredSkills = toSkillList(job.required_skills);
  if (candidateSkills.length > 0 && requiredSkills.length > 0) {
    const sharedCount = requiredSkills.filter((skill) =>
      candidateSkills.includes(skill)
    ).length;
    if (sharedCount >= 2) score += 2;
    else if (sharedCount >= 1) score += 1;
  }

  if (
    candidate.work_mode &&
    job.work_mode &&
    normalize(candidate.work_mode) === normalize(job.work_mode)
  ) {
    score += 1;
  }

  if (
    isRemote(job.work_mode) ||
    (candidate.city && job.city && normalize(candidate.city) === normalize(job.city))
  ) {
    score += 1;
  }

  const range = parseSalaryRange(job.salary_range);
  if (
    range &&
    typeof candidate.expected_salary === "number" &&
    candidate.expected_salary >= range.min &&
    candidate.expected_salary <= range.max
  ) {
    score += 1;
  }

  return Math.min(5, Math.max(0, score));
}

function getStars(score: number) {
  const clamped = Math.min(5, Math.max(0, score));
  return `${"★".repeat(clamped)}${"☆".repeat(5 - clamped)}`;
}

function getNormalizedTokens(value: string | null) {
  if (!value) return [];
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getOverlapRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(left.length, right.length);
}

function calculateJobSimilarity(source: JobListing, target: JobListing) {
  const roleSimilarity = roleMatchesClosely(source.title, target.title)
    ? 1
    : getOverlapRatio(getNormalizedTokens(source.title), getNormalizedTokens(target.title));
  const skillSimilarity = getOverlapRatio(
    toSkillList(source.required_skills),
    toSkillList(target.required_skills)
  );
  const sameWorkMode =
    source.work_mode && target.work_mode
      ? normalize(source.work_mode) === normalize(target.work_mode)
      : false;
  const sameCity =
    source.city && target.city ? normalize(source.city) === normalize(target.city) : false;
  const bothRemote = isRemote(source.work_mode) && isRemote(target.work_mode);
  const locationModeSimilarity = sameWorkMode || sameCity || bothRemote ? 1 : 0;

  return roleSimilarity * 0.45 + skillSimilarity * 0.35 + locationModeSimilarity * 0.2;
}

function getAverageSimilarity(job: JobListing, anchors: JobListing[]) {
  if (anchors.length === 0) return 0;
  const total = anchors.reduce(
    (sum, anchor) => sum + calculateJobSimilarity(job, anchor),
    0
  );
  return total / anchors.length;
}

type RecommendationContext = {
  savedAnchors: JobListing[];
  appliedAnchors: JobListing[];
  hiddenAnchors: JobListing[];
  viewedAnchors: JobListing[];
};

const INTERACTION_PRIORITY: Record<InteractionStatus, number> = {
  applied: 3,
  saved: 2,
  viewed: 1,
};

export default function CandidateDashboardPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [summary, setSummary] = useState<Summary>({ viewed: 0, saved: 0, applied: 0 });
  const [insights, setInsights] = useState<Insights>({
    goodMatchApplications: 0,
    savedToAppliedRate: 0,
    highMatchViewedRecently: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentItem[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [viewedJobIds, setViewedJobIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [candidateEmail, setCandidateEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const [{ data: authData }, { data: profileData, error: profileError }] =
          await Promise.all([
            supabase.auth.getUser(),
            supabase
              .from("candidate_profiles")
              .select(
                "id, email, city, target_role, skills, expected_salary, work_mode"
              )
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

        if (!isMounted) return;

        if (profileError) {
          setStatus("error");
          setErrorMessage(profileError.message);
          return;
        }

        const latestProfile = profileData ?? null;
        const email = authData.user?.email?.trim() ?? latestProfile?.email?.trim() ?? null;
        const candidateId = latestProfile?.id ?? null;

        setProfile(latestProfile);
        setCandidateEmail(email);

        if (!email && !candidateId) {
          setSummary({ viewed: 0, saved: 0, applied: 0 });
          setInsights({
            goodMatchApplications: 0,
            savedToAppliedRate: 0,
            highMatchViewedRecently: 0,
          });
          setRecentActivity([]);
          setJobs([]);
          setSavedJobIds(new Set());
          setViewedJobIds(new Set());
          setAppliedJobIds(new Set());
          setHiddenJobIds(new Set());
          setStatus("success");
          return;
        }

        const [applicationsRes, viewsRes, hiddenRes, jobsRes] = await Promise.all([
          email
            ? supabase
                .from("applications")
                .select("job_id, status, created_at")
                .eq("candidate_email", email)
                .in("status", ["saved", "applied"])
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          candidateId
            ? supabase
                .from("candidate_job_views")
                .select("job_id, viewed_at")
                .eq("candidate_id", candidateId)
                .order("viewed_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          candidateId
            ? supabase
                .from("candidate_hidden_jobs")
                .select("job_id")
                .eq("candidate_id", candidateId)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("job_listings")
            .select(
              "id, title, company_name, city, work_mode, salary_range, required_skills, created_at"
            ),
        ]);

        if (!isMounted) return;

        if (applicationsRes.error) {
          setStatus("error");
          setErrorMessage(applicationsRes.error.message);
          return;
        }

        if (viewsRes.error) {
          setStatus("error");
          setErrorMessage(viewsRes.error.message);
          return;
        }

        if (jobsRes.error) {
          setStatus("error");
          setErrorMessage(jobsRes.error.message);
          return;
        }
        if (hiddenRes.error) {
          setStatus("error");
          setErrorMessage(hiddenRes.error.message);
          return;
        }

        const normalizedApplications: ApplicationRow[] = (applicationsRes.data ?? [])
          .map((item) => {
            const normalizedStatus = normalizeApplicationStatus(
              (item.status as string | null) ?? null
            );
            if (!normalizedStatus) return null;
            return {
              job_id: (item.job_id as string | null) ?? null,
              status: normalizedStatus,
              created_at: (item.created_at as string | null) ?? null,
            };
          })
          .filter((row): row is ApplicationRow => row !== null);

        const viewedRows: ViewedRow[] = (viewsRes.data ?? []).map((item) => ({
          job_id: (item.job_id as string | null) ?? null,
          viewed_at: (item.viewed_at as string | null) ?? null,
        }));
        const hiddenIds = new Set(
          (hiddenRes.data ?? [])
            .map((item) => String(item.job_id ?? ""))
            .filter(Boolean)
        );
        setHiddenJobIds(hiddenIds);

        const listings: JobListing[] = (jobsRes.data ?? []).map((job) => ({
          id: String(job.id),
          title: (job.title as string | null) ?? null,
          company_name: (job.company_name as string | null) ?? null,
          city: (job.city as string | null) ?? null,
          work_mode: (job.work_mode as string | null) ?? null,
          salary_range: (job.salary_range as string | null) ?? null,
          required_skills: (job.required_skills as string | string[] | null) ?? null,
          created_at: (job.created_at as string | null) ?? null,
        }));
        setJobs(listings);

        const savedCount = normalizedApplications.filter(
          (row) => row.status === "saved"
        ).length;
        const appliedCount = normalizedApplications.filter(
          (row) => row.status === "applied"
        ).length;
        const nextAppliedJobIds = new Set(
          normalizedApplications
            .filter((row) => row.status === "applied")
            .map((row) => row.job_id)
            .filter((id): id is string => Boolean(id))
        );
        const nextSavedJobIds = new Set(
          normalizedApplications
            .filter((row) => row.status === "saved")
            .map((row) => row.job_id)
            .filter((id): id is string => Boolean(id))
        );
        const nextViewedJobIds = new Set(
          viewedRows.map((row) => row.job_id).filter((id): id is string => Boolean(id))
        );
        setSavedJobIds(nextSavedJobIds);
        setViewedJobIds(nextViewedJobIds);
        setAppliedJobIds(nextAppliedJobIds);
        setSummary({
          viewed: viewedRows.length,
          saved: savedCount,
          applied: appliedCount,
        });

        const listingById = new Map(listings.map((item) => [item.id, item]));
        const appliedJobIds = Array.from(
          new Set(
            normalizedApplications
              .filter((row) => row.status === "applied")
              .map((row) => row.job_id)
              .filter((id): id is string => Boolean(id))
          )
        );
        const goodMatchApplications = appliedJobIds.filter((jobId) => {
          const linked = listingById.get(jobId);
          if (!linked) return false;
          return calculateMatchScore(linked, latestProfile) >= 4;
        }).length;

        const highMatchViewedRecently = viewedRows.filter((row) => {
          if (!row.job_id || !row.viewed_at) return false;
          const linked = listingById.get(row.job_id);
          if (!linked) return false;
          const viewedTime = new Date(row.viewed_at).getTime();
          if (Number.isNaN(viewedTime)) return false;
          const withinLast14Days =
            Date.now() - viewedTime <= 1000 * 60 * 60 * 24 * 14;
          if (!withinLast14Days) return false;
          return calculateMatchScore(linked, latestProfile) >= 4;
        }).length;

        const savedToAppliedRate =
          savedCount > 0 ? Math.round((appliedCount / savedCount) * 100) : 0;
        setInsights({
          goodMatchApplications,
          savedToAppliedRate,
          highMatchViewedRecently,
        });

        const jobsById = new Map(
          listings.map((job) => [
            job.id,
            {
              title: job.title ?? "Vacante sin título",
              company_name: job.company_name ?? "Empresa no especificada",
            },
          ])
        );

        const interactionMap = new Map<string, { status: InteractionStatus; timestamp: string | null }>();

        for (const row of normalizedApplications) {
          if (!row.job_id) continue;
          const current = interactionMap.get(row.job_id);
          if (!current) {
            interactionMap.set(row.job_id, { status: row.status, timestamp: row.created_at });
            continue;
          }

          const currentPriority = INTERACTION_PRIORITY[current.status];
          const nextPriority = INTERACTION_PRIORITY[row.status];
          const currentTime = current.timestamp ? new Date(current.timestamp).getTime() : 0;
          const nextTime = row.created_at ? new Date(row.created_at).getTime() : 0;

          if (nextPriority > currentPriority || (nextPriority === currentPriority && nextTime > currentTime)) {
            interactionMap.set(row.job_id, { status: row.status, timestamp: row.created_at });
          }
        }

        for (const view of viewedRows) {
          if (!view.job_id) continue;
          const current = interactionMap.get(view.job_id);
          if (!current) {
            interactionMap.set(view.job_id, { status: "viewed", timestamp: view.viewed_at });
          }
        }

        const recent = Array.from(interactionMap.entries())
          .map(([jobId, interaction]) => {
            const linkedJob = jobsById.get(jobId);
            return {
              job_id: jobId,
              status: interaction.status,
              timestamp: interaction.timestamp,
              title: linkedJob?.title ?? "Vacante sin título",
              company_name: linkedJob?.company_name ?? "Empresa no especificada",
            };
          })
          .sort((a, b) => {
            const priorityDiff =
              INTERACTION_PRIORITY[b.status] - INTERACTION_PRIORITY[a.status];
            if (priorityDiff !== 0) return priorityDiff;

            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
          })
          .slice(0, 6);
        setRecentActivity(recent);

        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error inesperado cargando el dashboard."
        );
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const recommendationContext = useMemo<RecommendationContext>(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const toAnchors = (ids: Set<string>) =>
      Array.from(ids)
        .map((id) => jobsById.get(id))
        .filter((job): job is JobListing => Boolean(job));

    return {
      savedAnchors: toAnchors(savedJobIds),
      appliedAnchors: toAnchors(appliedJobIds),
      hiddenAnchors: toAnchors(hiddenJobIds),
      viewedAnchors: toAnchors(viewedJobIds),
    };
  }, [jobs, savedJobIds, appliedJobIds, hiddenJobIds, viewedJobIds]);

  const recommendedJobs = useMemo(() => {
    return [...jobs]
      .filter((job) => !appliedJobIds.has(job.id))
      .filter((job) => !hiddenJobIds.has(job.id))
      .sort((a, b) => {
        const scoreA = calculateMatchScore(a, profile);
        const scoreB = calculateMatchScore(b, profile);
        if (scoreB !== scoreA) return scoreB - scoreA;
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [jobs, profile, appliedJobIds, hiddenJobIds]);

  const recommendationReasonByJobId = useMemo(() => {
    const reasons = new Map<string, string>();
    for (const job of recommendedJobs) {
      const score = calculateMatchScore(job, profile);
      const appliedSimilarity = getAverageSimilarity(job, recommendationContext.appliedAnchors);
      const savedSimilarity = getAverageSimilarity(job, recommendationContext.savedAnchors);
      const viewedSimilarity = getAverageSimilarity(job, recommendationContext.viewedAnchors);
      const hiddenSimilarity = getAverageSimilarity(job, recommendationContext.hiddenAnchors);

      const interestedAnchors = [
        ...recommendationContext.savedAnchors,
        ...recommendationContext.appliedAnchors,
      ];
      const interestSkillSimilarity = interestedAnchors.length
        ? interestedAnchors.reduce((sum, anchor) => {
            const overlap = getOverlapRatio(
              toSkillList(job.required_skills),
              toSkillList(anchor.required_skills)
            );
            return sum + overlap;
          }, 0) / interestedAnchors.length
        : 0;

      const matchesRemotePreference =
        Boolean(profile?.work_mode) &&
        normalize(profile.work_mode ?? "").includes("remoto") &&
        isRemote(job.work_mode);

      const matchesWorkModePreference =
        Boolean(profile?.work_mode && job.work_mode) &&
        normalize(profile?.work_mode ?? "") === normalize(job.work_mode ?? "");

      let reason = "Tu perfil tiene buena coincidencia con esta vacante.";
      if (appliedSimilarity >= 0.5) {
        reason = "Se parece a roles a los que ya postulaste.";
      } else if (savedSimilarity >= 0.45) {
        reason = "Se parece a vacantes que guardaste.";
      } else if (interestSkillSimilarity >= 0.35) {
        reason = "Tiene habilidades similares a vacantes que te interesaron.";
      } else if (matchesRemotePreference) {
        reason = "Coincide con tu preferencia por trabajo remoto.";
      } else if (matchesWorkModePreference) {
        reason = "Coincide con tu modalidad de trabajo preferida.";
      } else if (viewedSimilarity >= 0.55 && hiddenSimilarity < 0.45) {
        reason = "Se parece a roles que has explorado.";
      } else if (score >= 4) {
        reason = "Tu perfil tiene buena coincidencia con esta vacante.";
      }

      reasons.set(job.id, reason);
    }
    return reasons;
  }, [recommendedJobs, profile, recommendationContext]);

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

  let content: React.ReactNode = null;

  if (status === "idle" || status === "loading") {
    content = <LoadingState />;
  } else if (status === "error") {
    content = (
      <EmptyState
        title="No pudimos cargar tu dashboard"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <article className="ds-card p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Vistas
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]">
              {summary.viewed}
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              Vacantes que ya abriste.
            </p>
          </article>
          <article className="ds-card p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Guardadas
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]">
              {summary.saved}
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              Vacantes que marcaste para revisar despues.
            </p>
          </article>
          <article className="ds-card p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Postuladas
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]">
              {summary.applied}
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              Postulaciones que ya registraste en Fichur.
            </p>
          </article>
        </section>

        <section className="ds-card p-5 sm:p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Tus insights
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Señales rápidas para entender cómo avanza tu búsqueda.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                Actividad
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-[#0F172A]">🔎 Has explorado {summary.viewed} vacantes.</p>
                <p className="text-sm text-[#0F172A]">
                  ⭐ Guardaste {summary.saved} vacantes interesantes.
                </p>
                <p className="text-sm text-[#0F172A]">📨 Ya aplicaste a {summary.applied} vacantes.</p>
              </div>
            </article>
            <article className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                Match
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-[#0F172A]">
                  ✅ {insights.goodMatchApplications} de tus postulaciones tenían buen match.
                </p>
                <p className="text-sm text-[#0F172A]">
                  📈 Has convertido {insights.savedToAppliedRate}% de tus vacantes guardadas en postulaciones.
                </p>
                <p className="text-sm text-[#0F172A]">
                  👀 Viste {insights.highMatchViewedRecently} vacantes con match alto en las últimas 2 semanas.
                </p>
              </div>
            </article>
            <article className="rounded-xl border border-zinc-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                Sugerencia
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-[#0F172A]">
                  {summary.applied === 0
                    ? "Empieza por postularte a una vacante con match alto para activar tu avance."
                    : insights.goodMatchApplications < summary.applied
                      ? "Revisa vacantes con match alto para aumentar tus probabilidades."
                      : "Vas bien: repite el patrón de tus mejores matches para mantener el avance."}
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Vacantes recomendadas para ti hoy
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Vacantes con mejor match que no has ocultado ni postulado.
          </p>

          {recommendedJobs.length === 0 ? (
            <p className="mt-4 text-sm text-[#475569]">
              No hay nuevas recomendaciones hoy. Revisa tus búsquedas guardadas o explora más vacantes.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recommendedJobs.map((job) => {
                const score = calculateMatchScore(job, profile);
                const locationLine = getLocationWorkModeLine(job.city, job.work_mode);
                const salaryLine = formatSalaryDisplay(job.salary_range);
                const reason =
                  recommendationReasonByJobId.get(job.id) ??
                  "Tu perfil tiene buena coincidencia con esta vacante.";
                return (
                  <li key={job.id}>
                    <Link
                      href={`/candidate/jobs/${job.id}`}
                      className="group block h-full rounded-xl border border-zinc-100 bg-white p-4 transition hover:border-[#CBD5E1] hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {getStars(score)}
                        </span>
                        {score >= 4 ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Buen match
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm font-semibold text-[#0F172A]">
                        {job.title ?? "Vacante sin título"}
                      </p>
                      <p className="mt-1 text-xs text-[#475569]">
                        {job.company_name ?? "Empresa no especificada"}
                      </p>

                      {locationLine ? (
                        <p className="mt-2 text-xs text-[#475569]">{locationLine}</p>
                      ) : null}
                      {salaryLine ? (
                        <p className="mt-1 text-xs text-[#475569]">{salaryLine} MXN</p>
                      ) : null}
                      <p className="mt-2 line-clamp-1 text-xs text-[#64748B]">{reason}</p>

                      <p className="mt-3 text-xs font-medium text-[#3B4EFF] group-hover:text-[#2F3DE0]">
                        Ver vacante
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ds-card p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="ds-heading text-base font-semibold tracking-tight">
                Atajos
              </h2>
              <p className="mt-1 text-sm text-[#475569]">
                Continua tu flujo en un solo clic.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/candidate/jobs">
                <Button>Ver vacantes</Button>
              </Link>
              <Link href="/candidate/applications">
                <Button variant="secondary">Ver mis vacantes</Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Continúa donde te quedaste
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Actividad reciente con prioridad por estado: postuladas, guardadas y vistas.
          </p>

          {candidateEmail === null && !profile?.id ? (
            <p className="mt-4 text-sm text-[#475569]">
              Completa onboarding para asociar actividad a tu perfil.
            </p>
          ) : recentActivity.length === 0 ? (
            <p className="mt-4 text-sm text-[#475569]">
              Aun no tienes actividad. Explora vacantes y continúa desde aquí.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentActivity.map((item) => (
                <li
                  key={`${item.job_id}-${item.status}`}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#0F172A]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[#475569]">{item.company_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.status === "applied"
                          ? "bg-emerald-100 text-emerald-700"
                          : item.status === "saved"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {item.status === "applied"
                        ? "Postulada"
                        : item.status === "saved"
                          ? "Guardada"
                          : "Vista"}
                    </span>
                    <p className="text-xs text-[#475569]">{formatDate(item.timestamp)}</p>
                    <Link href={`/candidate/jobs/${item.job_id}`}>
                      <Button variant="secondary" className="px-4 py-2 text-xs">
                        Abrir
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tu espacio de búsqueda"
        description="Da seguimiento a tus vacantes y continúa donde te quedaste."
        action={
          <Link href="/candidate/jobs">
            <Button>Ver vacantes</Button>
          </Link>
        }
      />
      {content}
    </div>
  );
}

