"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CandidateDashboardDraftCard } from "@/components/candidate/CandidateDashboardDraftCard";
import { ProfileQualityPanel } from "@/components/candidate/ProfileQualityPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ProductEmptyState } from "@/components/shared/ProductEmptyState";
import { welcomeFirstName } from "@/lib/auth/navUserLabel";
import { normalizeApplicationStatus } from "@/lib/candidate/application-state";
import { isCandidateProfileThin } from "@/lib/candidate/profileCompleteness";
import {
  competenciaEstimadaLine,
  getProbabilityPresentation,
} from "@/lib/jobs/responseProbabilityUi";
import {
  getJobCardMetaLines,
  getJobCardWhyBullets,
  jobCardWhyHeading,
} from "@/lib/jobs/jobCardDecisionSignals";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type CandidateProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  city: string | null;
  target_role: string | null;
  skills: string | null;
  summary?: string | null;
  expected_salary: number | null;
  work_mode: string | null;
  industries?: string | null;
  years_experience?: number | null;
};

function DashboardActionCard({
  href,
  title,
  description,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex h-full flex-col rounded-2xl border p-5 transition",
        accent
          ? "border-indigo-200/90 bg-gradient-to-br from-indigo-50/80 to-violet-50/40 hover:border-indigo-300 hover:shadow-md"
          : "border-zinc-200/90 bg-white hover:border-zinc-300 hover:shadow-md",
      ].join(" ")}
    >
      <p className="text-[15px] font-semibold tracking-tight text-[#0F172A]">
        {title}
      </p>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-zinc-600">
        {description}
      </p>
      <span
        className={`mt-4 text-xs font-semibold ${
          accent ? "text-indigo-700" : "text-zinc-700"
        }`}
      >
        Abrir →
      </span>
    </Link>
  );
}

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
  description?: string | null;
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

  const reloadProfileOnly = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("candidate_profiles")
        .select(
          "id, email, full_name, city, target_role, skills, summary, expected_salary, work_mode, industries, years_experience",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setProfile(data as CandidateProfile);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadProfileOnly();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reloadProfileOnly]);

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
                "id, email, full_name, city, target_role, skills, summary, expected_salary, work_mode, industries, years_experience"
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
              "id, title, company_name, city, work_mode, salary_range, required_skills, created_at, description"
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
          description: (job.description as string | null) ?? null,
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
    const greet = welcomeFirstName(profile?.full_name, candidateEmail);
    const thin = isCandidateProfileThin(profile);

    content = (
      <div className="flex flex-col gap-8">
        {!profile?.id ? (
          <ProductEmptyState
            title="Tu perfil aún no está listo"
            subtitle="Genera tu perfil con IA para empezar a recibir vacantes con mayor probabilidad de respuesta."
            ctaLabel="Crear perfil con IA"
            ctaHref="/onboarding"
            icon="profile"
          />
        ) : null}

        {profile?.id ? <ProfileQualityPanel profile={profile} /> : null}

        <header className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-[1.65rem]">
              Hola{greet ? `, ${greet}` : ""}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Estas son tus siguientes acciones
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DashboardActionCard
              href="/candidate/jobs"
              title="Explorar vacantes"
              description="Vacantes ordenadas para ti, con señales claras de encaje."
            />
            <DashboardActionCard
              href="/candidate/applications"
              title="Ver postulaciones"
              description="Revisa lo que guardaste y lo que ya enviaste."
            />
            <DashboardActionCard
              href="/candidate/onboarding"
              title="Completar o editar perfil"
              description="Actualiza rol, habilidades y expectativas cuando quieras."
            />
            {thin ? (
              <DashboardActionCard
                href="/onboarding"
                accent
                title="Crear perfil con IA"
                description="Sube tu CV y deja que extraigamos tu experiencia en minutos."
              />
            ) : null}
          </div>

          <CandidateDashboardDraftCard />
        </header>

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
            Resumen de actividad
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Actividad
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-snug text-[#0F172A]">
                <li>{summary.viewed} vacantes vistas</li>
                <li>{summary.saved} guardadas</li>
                <li>{summary.applied} postulaciones</li>
              </ul>
            </article>
            <article className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Señales
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-snug text-[#0F172A]">
                <li>
                  {insights.goodMatchApplications} postulaciones con alta probabilidad de respuesta
                </li>
                <li>{insights.savedToAppliedRate}% de guardadas pasaron a postulación</li>
                <li>
                  {insights.highMatchViewedRecently} vacantes fuertes vistas en los últimos 14 días
                </li>
              </ul>
            </article>
            <article className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Siguiente paso
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#0F172A]">
                {summary.applied === 0
                  ? "Postúlate a una vacante con buen encaje para empezar a ver avance."
                  : insights.goodMatchApplications < summary.applied
                    ? "Prioriza vacantes con probabilidad alta para mejorar respuestas."
                    : "Sigue el mismo patrón en vacantes similares a las que ya te funcionaron."}
              </p>
            </article>
          </div>
        </section>

        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Vacantes recomendadas para ti hoy
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Vacantes con mejor probabilidad de respuesta que no has ocultado ni postulado.
          </p>

          {recommendedJobs.length === 0 ? (
            <div className="mt-6">
              {jobs.length === 0 ? (
                <p className="text-sm leading-relaxed text-zinc-600">
                  Cuando haya vacantes publicadas, te sugeriremos las que mejor encajan contigo.
                </p>
              ) : thin ? (
                <ProductEmptyState
                  title="Mejora tu perfil para ver mejores oportunidades"
                  subtitle="Un perfil más completo aumenta tus probabilidades de recibir respuesta."
                  ctaLabel="Editar perfil"
                  ctaHref="/candidate/onboarding"
                  icon="profile"
                />
              ) : (
                <ProductEmptyState
                  title="Explora más vacantes"
                  subtitle="Ahora mismo no hay nuevas recomendaciones en tu lista. Sigue explorando o revisa las que ya guardaste."
                  ctaLabel="Explorar vacantes"
                  ctaHref="/candidate/jobs"
                  icon="search"
                />
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recommendedJobs.map((job) => {
                const score = calculateMatchScore(job, profile);
                const probability = getProbabilityPresentation(null, score);
                const meta = getJobCardMetaLines(job);
                const whyBullets = getJobCardWhyBullets(job, profile, {});
                const whyHeading = jobCardWhyHeading(probability.tier);
                return (
                  <li key={job.id}>
                    <Link
                      href={`/candidate/jobs/${job.id}`}
                      className="group flex h-full flex-col rounded-xl border border-zinc-100 bg-white p-4 transition hover:border-[#CBD5E1] hover:shadow-sm"
                    >
                      <span
                        className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ${probability.badgeClass}`}
                      >
                        {probability.label}
                      </span>

                      <p className="mt-3 line-clamp-2 text-sm font-semibold text-[#0F172A]">
                        {job.title ?? "Vacante sin título"}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#475569]">
                        {job.company_name ?? "Empresa no especificada"}
                      </p>

                      <dl className="mt-2 grid gap-0.5 text-[11px] text-[#64748B]">
                        <div className="flex flex-wrap gap-x-1">
                          <dt className="font-semibold text-[#475569]">Ubicación</dt>
                          <dd>{meta.ubicacion}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-1">
                          <dt className="font-semibold text-[#475569]">Modalidad</dt>
                          <dd>{meta.modalidad}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-1">
                          <dt className="font-semibold text-[#475569]">Salario</dt>
                          <dd>{meta.salario}</dd>
                        </div>
                      </dl>

                      <p className="mt-2 text-[11px] font-medium text-[#334155]">
                        {competenciaEstimadaLine(score)}
                      </p>

                      <div className="mt-2 flex-1 rounded-lg border border-zinc-100 bg-zinc-50/90 p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                          {whyHeading}
                        </p>
                        <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-[#334155]">
                          {whyBullets.map((line, idx) => (
                            <li key={`${job.id}-dash-why-${idx}`} className="flex gap-1.5">
                              <span className="shrink-0 text-[#94A3B8]">·</span>
                              <span className="line-clamp-3">{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
                        <span className="text-xs font-semibold text-[#0F172A]">
                          Ver vacante y postularme
                        </span>
                        <span className="text-xs font-medium text-[#3B4EFF] group-hover:text-[#2F3DE0]">
                          Abrir →
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Reciente
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Postuladas, guardadas y vistas, en orden útil.
          </p>

          {candidateEmail === null && !profile?.id ? (
            <p className="mt-4 text-sm text-zinc-600">
              Cuando completes tu perfil, verás aquí lo que vayas visitando y guardando.
            </p>
          ) : recentActivity.length === 0 ? (
            <div className="mt-6">
              <ProductEmptyState
                className="max-w-md !py-10"
                title="Sin actividad reciente"
                subtitle="Explora vacantes y vuelve aquí para retomar lo que te interesó."
                ctaLabel="Explorar vacantes"
                ctaHref="/candidate/jobs"
                icon="inbox"
              />
            </div>
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

  return <div className="flex flex-col gap-6">{content}</div>;
}

