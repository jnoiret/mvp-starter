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
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { recruiterAnalysisProbabilityBadge } from "@/lib/jobs/responseProbabilityUi";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type RecruiterJob = {
  id: string;
  job_title: string | null;
  company: string | null;
  description: string | null;
  seniority: string | null;
  industry: string | null;
};

type CandidateProfile = {
  id: string;
  created_at: string | null;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  target_role: string | null;
  skills: string | null;
  years_experience: number | null;
  expected_salary: number | null;
  work_mode: string | null;
  cv_url: string | null;
};

type PageStatus = "loading" | "success" | "error" | "not_found";
type ShortlistStatus = "saved" | "interview" | "rejected";

type AnalysisState = {
  status: "loading" | "success" | "error";
  data: MatchAnalysis | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function toCandidateName(candidate: CandidateProfile) {
  const fullName = normalizeText(candidate.full_name);
  if (fullName) return fullName;
  const email = normalizeText(candidate.email);
  if (email) return email;
  return "Candidato sin nombre";
}

function formatSalary(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function isValidCvUrl(value: string | null) {
  const raw = normalizeText(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!isHttp) return false;
    // Signed Supabase URLs often expire and generate broken recruiter actions.
    if (parsed.pathname.includes("/storage/v1/object/sign/")) return false;
    if (raw.toLowerCase().includes("undefined") || raw.toLowerCase().includes("null")) return false;
    return true;
  } catch {
    return false;
  }
}

function getTopSkills(skills: string | null, max = 5) {
  return normalizeText(skills)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function toCandidatePayload(candidate: CandidateProfile) {
  return {
    summary: deriveCandidateSummary(candidate),
    skills: normalizeText(candidate.skills),
    tools: "",
    industries: "",
    seniority: "",
    years_experience:
      typeof candidate.years_experience === "number" && Number.isFinite(candidate.years_experience)
        ? candidate.years_experience
        : 0,
  };
}

function deriveCandidateSummary(candidate: CandidateProfile) {
  const targetRole = normalizeText(candidate.target_role);
  const years =
    typeof candidate.years_experience === "number" && Number.isFinite(candidate.years_experience)
      ? `${candidate.years_experience} años`
      : "";
  const firstSkills = normalizeText(candidate.skills)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const parts = [
    targetRole ? `Rol objetivo: ${targetRole}.` : "",
    years ? `Experiencia: ${years}.` : "",
    firstSkills ? `Skills clave: ${firstSkills}.` : "",
  ].filter(Boolean);

  return parts.join(" ").trim() || "Perfil sin resumen estructurado.";
}

function toJobPayload(job: RecruiterJob) {
  return {
    title: normalizeText(job.job_title),
    company: normalizeText(job.company),
    description: normalizeText(job.description),
    requirements: normalizeText(job.description),
    industry: normalizeText(job.industry),
  };
}

export default function RecruiterJobMatchesPage() {
  const params = useParams<{ id: string }>();
  const jobId = typeof params?.id === "string" ? params.id : "";

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [job, setJob] = useState<RecruiterJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [analysisByCandidateId, setAnalysisByCandidateId] = useState<
    Record<string, AnalysisState>
  >({});
  const [savedCandidates, setSavedCandidates] = useState<Set<string>>(new Set());
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadBaseData() {
      if (!jobId) {
        setStatus("not_found");
        return;
      }

      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const candidateSelectColumns =
          "id, created_at, full_name, email, whatsapp, city, target_role, years_experience, skills, expected_salary, work_mode, cv_url";
        if (process.env.NODE_ENV !== "production") {
          console.info("[recruiter/matches] loading data", {
            job_table: "recruiter_jobs",
            candidates_table: "candidate_profiles",
            job_id: jobId,
            candidates_select_columns: candidateSelectColumns,
          });
        }
        const [{ data: jobData, error: jobError }, { data: candidateData, error: candidateError }] =
          await Promise.all([
            supabase
              .from("recruiter_jobs")
              .select("id, job_title, company, description, seniority, industry")
              .eq("id", jobId)
              .maybeSingle(),
            supabase
              .from("candidate_profiles")
              .select(candidateSelectColumns)
              .order("created_at", { ascending: false })
              .limit(100),
          ]);

        if (!mounted) return;

        if (jobError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/matches] recruiter_jobs fetch failed", {
              table: "recruiter_jobs",
              message: jobError.message,
              details: jobError.details,
              hint: jobError.hint,
              code: jobError.code,
              job_id: jobId,
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

        if (candidateError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/matches] candidate_profiles fetch failed", {
              table: "candidate_profiles",
              selected_columns: candidateSelectColumns,
              message: candidateError.message,
              details: candidateError.details,
              hint: candidateError.hint,
              code: candidateError.code,
              schema_mismatch_possible: candidateError.message.includes("does not exist"),
            });
          }
          setStatus("error");
          setErrorMessage(candidateError.message);
          return;
        }

        const normalizedJob: RecruiterJob = {
          id: String(jobData.id),
          job_title: (jobData.job_title as string | null) ?? null,
          company: (jobData.company as string | null) ?? null,
          description: (jobData.description as string | null) ?? null,
          seniority: (jobData.seniority as string | null) ?? null,
          industry: (jobData.industry as string | null) ?? null,
        };

        const normalizedCandidates: CandidateProfile[] = (candidateData ?? []).map((item) => ({
          id: String(item.id),
          created_at: (item.created_at as string | null) ?? null,
          full_name: (item.full_name as string | null) ?? null,
          email: (item.email as string | null) ?? null,
          whatsapp: (item.whatsapp as string | null) ?? null,
          city: (item.city as string | null) ?? null,
          target_role: (item.target_role as string | null) ?? null,
          skills: (item.skills as string | null) ?? null,
          years_experience: (item.years_experience as number | null) ?? null,
          expected_salary: (item.expected_salary as number | null) ?? null,
          work_mode: (item.work_mode as string | null) ?? null,
          cv_url: (item.cv_url as string | null) ?? null,
        }));

        setJob(normalizedJob);
        setCandidates(normalizedCandidates);
        setAnalysisByCandidateId(
          Object.fromEntries(
            normalizedCandidates.map((candidate) => [
              candidate.id,
              { status: "loading", data: null } as AnalysisState,
            ])
          )
        );
        setStatus("success");
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Error inesperado cargando resultados."
        );
      }
    }

    void loadBaseData();

    return () => {
      mounted = false;
    };
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    if (!job || candidates.length === 0) return;

    const runAnalysis = async () => {
      const concurrency = 4;
      const queue = [...candidates];
      const jobPayload = toJobPayload(job);

      const worker = async () => {
        while (!cancelled && queue.length > 0) {
          const candidate = queue.shift();
          if (!candidate) return;
          try {
            const analysis = await getJobMatchAnalysis({
              candidate_profile: toCandidatePayload(candidate),
              job_listing: jobPayload,
            });
            if (cancelled) return;
            setAnalysisByCandidateId((prev) => ({
              ...prev,
              [candidate.id]: { status: "success", data: analysis },
            }));
          } catch {
            if (cancelled) return;
            setAnalysisByCandidateId((prev) => ({
              ...prev,
              [candidate.id]: { status: "error", data: null },
            }));
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    };

    void runAnalysis();

    return () => {
      cancelled = true;
    };
  }, [job, candidates]);

  const rankedCandidates = useMemo(() => {
    const withIndex = candidates.map((candidate, index) => ({
      candidate,
      index,
      analysis: analysisByCandidateId[candidate.id] ?? { status: "loading", data: null },
      score:
        (analysisByCandidateId[candidate.id]?.data?.match_score ?? 0) > 0
          ? (analysisByCandidateId[candidate.id]?.data?.match_score ?? -1)
          : -1,
    }));

    withIndex.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return withIndex;
  }, [candidates, analysisByCandidateId]);

  const topCandidateIds = useMemo(() => {
    return rankedCandidates
      .filter((item) => item.analysis.status === "success" && item.analysis.data)
      .slice(0, 3)
      .map((item) => item.candidate.id);
  }, [rankedCandidates]);

  async function handleSaveCandidate(candidateId: string, status: ShortlistStatus = "saved") {
    if (!job) return;
    setSavingCandidateId(candidateId);
    try {
      const response = await fetch("/api/recruiter/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          job_id: job.id,
          notes: "",
          status,
        }),
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[recruiter/matches] save shortlist failed", {
            table: "recruiter_shortlist",
            payload: {
              candidate_id: candidateId,
              job_id: job.id,
              notes: "",
              status,
            },
            response_status: response.status,
            response_body: payload,
          });
        }
        return;
      }
      setSavedCandidates((prev) => {
        const next = new Set(prev);
        next.add(candidateId);
        return next;
      });
    } finally {
      setSavingCandidateId(null);
    }
  }

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error") {
    return (
      <EmptyState
        title="No pudimos cargar los resultados"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  }

  if (status === "not_found" || !job) {
    return (
      <EmptyState
        title="Vacante no encontrada"
        description="No encontramos esta vacante de reclutamiento."
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Aun no hay candidatos"
        description="No hay perfiles de candidatos disponibles para analizar."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/recruiter/jobs/new" className="text-sm text-[#475569] hover:text-[#0F172A]">
            ← Volver a crear vacante
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/recruiter/shortlist"
              className="inline-flex rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
            >
              Shortlist
            </Link>
            <Link
              href={`/recruiter/jobs/${job.id}`}
              className="inline-flex rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
            >
              Ver vacante
            </Link>
          </div>
        </div>

        <PageHeader
          title={`Candidatos para ${job.job_title ?? "vacante"}`}
          description={job.company ?? "Empresa no especificada"}
        />

        <section className="grid gap-4">
        {rankedCandidates.map(({ candidate, analysis }, index) => {
          const isTop = topCandidateIds.includes(candidate.id);
          const isSaved = savedCandidates.has(candidate.id);
          const topSkills = getTopSkills(candidate.skills, 5);
          const cvValid = isValidCvUrl(candidate.cv_url);
          const shortSummary = deriveCandidateSummary(candidate);
          const probabilityBadge = recruiterAnalysisProbabilityBadge(analysis);

          return (
            <article
              key={candidate.id}
              className={`ds-card p-5 ${
                isTop ? "border border-amber-200 bg-amber-50/40" : ""
              }`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0F172A]">
                      {toCandidateName(candidate)}
                    </h2>
                    <p className="text-sm text-[#475569]">
                      {candidate.target_role || "Rol objetivo no especificado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTop ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Top {index + 1}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${probabilityBadge.badgeClass}`}
                    >
                      {probabilityBadge.label}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 text-sm text-[#334155] sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-[#0F172A]">Ubicación:</span>{" "}
                    {[candidate.city, candidate.work_mode].filter(Boolean).join(" · ") ||
                      "No especificada"}
                  </p>
                  <p>
                    <span className="font-medium text-[#0F172A]">Experiencia:</span>{" "}
                    {typeof candidate.years_experience === "number"
                      ? `${candidate.years_experience} años`
                      : "No especificada"}
                  </p>
                  <p>
                    <span className="font-medium text-[#0F172A]">Sueldo esperado:</span>{" "}
                    {formatSalary(candidate.expected_salary)
                      ? `${formatSalary(candidate.expected_salary)} MXN`
                      : "No especificado"}
                  </p>
                  <p>
                    <span className="font-medium text-[#0F172A]">Contacto:</span>{" "}
                    {candidate.email || candidate.whatsapp || "No disponible"}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="line-clamp-1 text-sm text-[#475569]">{shortSummary}</p>
                  <div className="flex flex-wrap gap-2">
                    {topSkills.length > 0 ? (
                      topSkills.map((skill, skillIndex) => (
                        <span
                          key={`${candidate.id}-skill-${skillIndex}`}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#64748B]">Sin skills registradas</span>
                    )}
                  </div>
                </div>

                {analysis.status === "loading" ? (
                  <p className="text-sm text-[#64748B]">
                    Analizando probabilidad de respuesta con IA...
                  </p>
                ) : analysis.status === "error" ? (
                  <p className="text-sm text-rose-600">
                    No pudimos analizar este perfil por ahora.
                  </p>
                ) : analysis.data ? (
                  <p className="text-sm text-[#334155]">{analysis.data.summary}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link href={`/recruiter/candidates/${candidate.id}?job_id=${job.id}`}>
                    <Button variant="secondary" type="button">
                      Ver perfil
                    </Button>
                  </Link>
                  {cvValid ? (
                    <a href={candidate.cv_url ?? "#"} target="_blank" rel="noreferrer">
                      <Button variant="secondary" type="button">
                        Ver CV
                      </Button>
                    </a>
                  ) : (
                    <Button variant="secondary" type="button" disabled>
                      CV no disponible
                    </Button>
                  )}
                  <Button
                    variant={isSaved ? "secondary" : "primary"}
                    type="button"
                    onClick={() => void handleSaveCandidate(candidate.id)}
                    disabled={savingCandidateId === candidate.id || isSaved}
                  >
                    {isSaved
                      ? "Candidato guardado"
                      : savingCandidateId === candidate.id
                        ? "Guardando..."
                        : "Guardar candidato"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
        </section>
      </div>
    </div>
  );
}
