"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  getJobMatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type RecruiterJob = {
  id: string;
  job_title: string | null;
  company: string | null;
  description: string | null;
  seniority: string | null;
  industry: string | null;
  created_at: string | null;
};

type ShortlistStatus = "saved" | "interview" | "rejected";
type PageStatus = "loading" | "success" | "error" | "not_found";

type ShortlistItem = {
  candidate_id: string;
  status: ShortlistStatus;
  notes: string | null;
  candidate_name: string | null;
};

type ShortlistCandidateProfile = {
  id: string;
  full_name: string | null;
  target_role: string | null;
  years_experience: number | null;
  skills: string | null;
  city: string | null;
  work_mode: string | null;
};

type CandidatePreview = {
  candidate_id: string;
  candidate_name: string;
  score: number | null;
  summary: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function formatCreatedAt(value: string | null) {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function extractRequirementChips(description: string | null, max = 10) {
  const text = normalizeText(description);
  if (!text) return [];
  const tokens = text
    .split(/[\n,;|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 50);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
    if (result.length >= max) break;
  }
  return result;
}

function fitLabel(score: number | null) {
  if (typeof score !== "number") return "Por revisar";
  if (score >= 80) return "Muy alto";
  if (score >= 65) return "Alto";
  if (score >= 50) return "Medio";
  if (score > 0) return "Bajo";
  return "Inicial";
}

function deriveCandidateSummary(candidate: ShortlistCandidateProfile) {
  const role = normalizeText(candidate.target_role);
  const years =
    typeof candidate.years_experience === "number" && Number.isFinite(candidate.years_experience)
      ? `${candidate.years_experience} años`
      : "";
  const topSkills = normalizeText(candidate.skills)
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const location = [candidate.city, candidate.work_mode].filter(Boolean).join(" · ");
  const parts = [
    role ? `Rol objetivo: ${role}.` : "",
    years ? `Experiencia: ${years}.` : "",
    topSkills ? `Skills: ${topSkills}.` : "",
    location ? `Ubicación: ${location}.` : "",
  ].filter(Boolean);
  return parts.join(" ").trim() || "Perfil sin resumen estructurado.";
}

export default function RecruiterJobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = typeof params?.id === "string" ? params.id : "";
  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [job, setJob] = useState<RecruiterJob | null>(null);
  const [candidatesAnalyzed, setCandidatesAnalyzed] = useState<number>(0);
  const [shortlistItems, setShortlistItems] = useState<ShortlistItem[]>([]);
  const [shortlistCandidates, setShortlistCandidates] = useState<ShortlistCandidateProfile[]>([]);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [candidatePreviews, setCandidatePreviews] = useState<CandidatePreview[]>([]);
  const [averageMatchScore, setAverageMatchScore] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadJob() {
      if (!jobId) {
        setStatus("not_found");
        return;
      }
      setStatus("loading");
      setErrorMessage(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const [
          { data: jobData, error: jobError },
          { count: candidatesCount, error: candidatesCountError },
          { data: shortlistData, error: shortlistError },
        ] = await Promise.all([
          supabase
            .from("recruiter_jobs")
            .select("id, job_title, company, description, seniority, industry, created_at")
            .eq("id", jobId)
            .maybeSingle(),
          supabase
            .from("candidate_profiles")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("recruiter_shortlist")
            .select("candidate_id, status, notes")
            .eq("job_id", jobId),
        ]);

        if (!mounted) return;
        if (jobError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/job-detail] recruiter_jobs fetch failed", {
              table: "recruiter_jobs",
              job_id: jobId,
              message: jobError.message,
              details: jobError.details,
              hint: jobError.hint,
              code: jobError.code,
            });
          }
          setStatus("error");
          setErrorMessage(jobError.message);
          return;
        }
        if (!jobData) {
          setStatus("not_found");
          return;
        }

        if (candidatesCountError && process.env.NODE_ENV !== "production") {
          console.warn("[recruiter/job-detail] candidate_profiles count failed", {
            table: "candidate_profiles",
            message: candidatesCountError.message,
            details: candidatesCountError.details,
            hint: candidatesCountError.hint,
            code: candidatesCountError.code,
          });
        }

        if (shortlistError && process.env.NODE_ENV !== "production") {
          console.warn("[recruiter/job-detail] recruiter_shortlist fetch failed", {
            table: "recruiter_shortlist",
            job_id: jobId,
            message: shortlistError.message,
            details: shortlistError.details,
            hint: shortlistError.hint,
            code: shortlistError.code,
          });
        }

        const shortlistRows = (shortlistData ?? []) as Array<{
          candidate_id: string | null;
          status: ShortlistStatus | null;
          notes: string | null;
        }>;

        const candidateIds = Array.from(
          new Set(shortlistRows.map((row) => String(row.candidate_id ?? "")).filter(Boolean))
        );
        let candidateNamesById = new Map<string, string>();
        let shortlistProfiles: ShortlistCandidateProfile[] = [];
        if (candidateIds.length > 0) {
          const { data: candidateRows, error: candidateRowsError } = await supabase
            .from("candidate_profiles")
            .select("id, full_name, email, target_role, years_experience, skills, city, work_mode")
            .in("id", candidateIds);
          if (candidateRowsError && process.env.NODE_ENV !== "production") {
            console.warn("[recruiter/job-detail] candidate name lookup failed", {
              table: "candidate_profiles",
              message: candidateRowsError.message,
              details: candidateRowsError.details,
              hint: candidateRowsError.hint,
              code: candidateRowsError.code,
            });
          } else {
            candidateNamesById = new Map(
              (candidateRows ?? []).map((row) => [
                String(row.id),
                String(row.full_name ?? row.email ?? "Candidato"),
              ])
            );
            shortlistProfiles = (candidateRows ?? []).map((row) => ({
              id: String(row.id),
              full_name: (row.full_name as string | null) ?? null,
              target_role: (row.target_role as string | null) ?? null,
              years_experience: (row.years_experience as number | null) ?? null,
              skills: (row.skills as string | null) ?? null,
              city: (row.city as string | null) ?? null,
              work_mode: (row.work_mode as string | null) ?? null,
            }));
          }
        }

        setJob({
          id: String(jobData.id),
          job_title: (jobData.job_title as string | null) ?? null,
          company: (jobData.company as string | null) ?? null,
          description: (jobData.description as string | null) ?? null,
          seniority: (jobData.seniority as string | null) ?? null,
          industry: (jobData.industry as string | null) ?? null,
          created_at: (jobData.created_at as string | null) ?? null,
        });
        setCandidatesAnalyzed(candidatesCount ?? 0);
        setShortlistCandidates(shortlistProfiles);
        setShortlistItems(
          shortlistRows.map((row) => ({
            candidate_id: String(row.candidate_id ?? ""),
            status:
              row.status === "interview" || row.status === "rejected" || row.status === "saved"
                ? row.status
                : "saved",
            notes: row.notes ?? null,
            candidate_name: candidateNamesById.get(String(row.candidate_id ?? "")) ?? null,
          }))
        );
        setStatus("success");
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      }
    }
    void loadJob();
    return () => {
      mounted = false;
    };
  }, [jobId]);

  const requirementChips = useMemo(() => extractRequirementChips(job?.description ?? null), [job]);

  const shortlistCount = shortlistItems.length;
  const interviewCount = shortlistItems.filter((item) => item.status === "interview").length;
  const topMatch = candidatePreviews[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function hydratePreviews() {
      if (!job || shortlistCandidates.length === 0) {
        setPreviewStatus("ready");
        setCandidatePreviews([]);
        setAverageMatchScore(null);
        return;
      }

      setPreviewStatus("loading");
      const sampledCandidates = shortlistCandidates.slice(0, 8);
      const previewResults = await Promise.all(
        sampledCandidates.map(async (candidate): Promise<CandidatePreview> => {
          try {
            const analysis = await getJobMatchAnalysis({
              candidate_profile: {
                summary: deriveCandidateSummary(candidate),
                skills: normalizeText(candidate.skills),
                tools: "",
                industries: "",
                seniority: "",
                years_experience:
                  typeof candidate.years_experience === "number" ? candidate.years_experience : 0,
              },
              job_listing: {
                title: normalizeText(job.job_title),
                company: normalizeText(job.company),
                description: normalizeText(job.description),
                requirements: normalizeText(job.description),
                industry: normalizeText(job.industry),
              },
            });
            return {
              candidate_id: candidate.id,
              candidate_name: normalizeText(candidate.full_name) || "Candidato",
              score:
                typeof analysis.match_score === "number" && analysis.match_score > 0
                  ? analysis.match_score
                  : null,
              summary: analysis.summary || deriveCandidateSummary(candidate),
            };
          } catch {
            return {
              candidate_id: candidate.id,
              candidate_name: normalizeText(candidate.full_name) || "Candidato",
              score: null,
              summary: deriveCandidateSummary(candidate),
            };
          }
        })
      );

      if (cancelled) return;
      const sorted = [...previewResults].sort((a, b) => {
        const aScore = typeof a.score === "number" ? a.score : -1;
        const bScore = typeof b.score === "number" ? b.score : -1;
        return bScore - aScore;
      });
      const validScores = sorted
        .map((item) => item.score)
        .filter((value): value is number => typeof value === "number" && value > 0);

      setCandidatePreviews(sorted.slice(0, 3));
      setAverageMatchScore(
        validScores.length > 0
          ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
          : null
      );
      setPreviewStatus("ready");
    }

    void hydratePreviews();

    return () => {
      cancelled = true;
    };
  }, [job, shortlistCandidates]);

  if (status === "loading") return <LoadingState />;
  if (status === "error") {
    return (
      <EmptyState
        title="No pudimos cargar la vacante"
        description={errorMessage ?? "Ocurrio un error inesperado."}
      />
    );
  }
  if (status === "not_found" || !job) {
    return (
      <EmptyState
        title="Vacante no encontrada"
        description="La vacante no existe o fue eliminada."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/recruiter/jobs/new" className="text-sm text-[#475569] hover:text-[#0F172A]">
            ← Volver
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/recruiter/jobs/${job.id}/matches`}>
              <Button variant="primary" type="button">
                Ver matches
              </Button>
            </Link>
            <Button variant="secondary" type="button" disabled>
              Editar vacante
            </Button>
          </div>
        </div>

        <PageHeader
          title={job.job_title ?? "Vacante sin titulo"}
          description={
            [job.company ?? "Empresa no especificada", job.seniority, job.industry]
              .filter(Boolean)
              .join(" · ")
          }
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="ds-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#64748B]">
              Candidatos analizados
            </h2>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">{candidatesAnalyzed}</p>
          </section>
          <section className="ds-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#64748B]">
              Shortlist
            </h2>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">{shortlistCount}</p>
          </section>
          <section className="ds-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#64748B]">
              Top matches
            </h2>
            <p className="mt-2 text-3xl font-semibold text-[#0F172A]">{interviewCount}</p>
            <p className="mt-1 text-xs text-[#64748B]">En estado interview</p>
          </section>
        </div>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="ds-card p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#0F172A]">Resumen de la vacante</h2>
            <div className="mt-3 grid gap-2 text-sm text-[#334155] sm:grid-cols-2">
              <p>
                <span className="font-medium text-[#0F172A]">Puesto:</span>{" "}
                {job.job_title || "No especificado"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Empresa:</span>{" "}
                {job.company || "No especificada"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Seniority:</span>{" "}
                {job.seniority || "No especificado"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Industria:</span>{" "}
                {job.industry || "No especificada"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Creada:</span>{" "}
                {formatCreatedAt(job.created_at)}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Estado:</span> No disponible
              </p>
            </div>
          </article>
          <article className="ds-card p-6">
            <h2 className="text-base font-semibold text-[#0F172A]">Match overview / resultados</h2>
            <p className="mt-2 text-sm text-[#475569]">
              Revisa candidatos ordenados, guarda shortlist y avanza a entrevistas.
            </p>
            <div className="mt-3 space-y-1 text-sm text-[#334155]">
              <p>
                <span className="font-medium text-[#0F172A]">Top match:</span>{" "}
                {topMatch
                  ? `${topMatch.candidate_name} (${topMatch.score ? `${topMatch.score}%` : "Inicial"})`
                  : "Por calcular"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Promedio de match:</span>{" "}
                {averageMatchScore ? `${averageMatchScore}%` : "Por calcular"}
              </p>
            </div>
            <div className="mt-4">
              <Link href={`/recruiter/jobs/${job.id}/matches`}>
                <Button variant="primary" type="button">
                  Abrir matches
                </Button>
              </Link>
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="ds-card p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#0F172A]">Descripción</h2>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[#334155]">
              {job.description || "Sin descripción para esta vacante."}
            </p>
          </article>
          <article className="ds-card p-6">
            <h2 className="text-base font-semibold text-[#0F172A]">Habilidades / requisitos clave</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {requirementChips.length > 0 ? (
                requirementChips.map((chip, index) => (
                  <span
                    key={`${chip}-${index}`}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {chip}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[#64748B]">No se detectaron requisitos claros.</span>
              )}
            </div>
          </article>
        </section>

        <section className="ds-card p-6">
          <h2 className="text-base font-semibold text-[#0F172A]">Top matches</h2>
          {candidatePreviews.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-[#334155]">
              {candidatePreviews.map((item, index) => (
                <li key={`${item.candidate_id}-${index}`} className="rounded-lg border border-zinc-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[#0F172A]">{item.candidate_name}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {typeof item.score === "number" ? `${item.score}%` : "Inicial"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#64748B]">Fit: {fitLabel(item.score)}</p>
                </li>
              ))}
            </ul>
          ) : previewStatus === "loading" ? (
            <p className="mt-3 text-sm text-[#64748B]">Calculando previews de match...</p>
          ) : (
            <p className="mt-3 text-sm text-[#64748B]">
              Aún no hay candidatos en shortlist para esta vacante.
            </p>
          )}
          <div className="mt-4">
            <Link href={`/recruiter/jobs/${job.id}/matches`}>
              <Button variant="secondary" type="button">
                Ver matches
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
