"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  getJobMatchAnalysis,
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type CandidateProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  target_role: string | null;
  years_experience: number | null;
  skills: string | null;
  expected_salary: number | null;
  work_mode: string | null;
  cv_url: string | null;
};

type RecruiterJob = {
  id: string;
  job_title: string | null;
  company: string | null;
  description: string | null;
  industry: string | null;
};

type PageStatus = "loading" | "success" | "error" | "not_found";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
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
    if (parsed.pathname.includes("/storage/v1/object/sign/")) return false;
    if (raw.toLowerCase().includes("undefined") || raw.toLowerCase().includes("null")) return false;
    return true;
  } catch {
    return false;
  }
}

function deriveCandidateSummary(candidate: CandidateProfile) {
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
  const parts = [
    role ? `Rol objetivo: ${role}.` : "",
    years ? `Experiencia: ${years}.` : "",
    topSkills ? `Skills clave: ${topSkills}.` : "",
  ].filter(Boolean);
  return parts.join(" ").trim() || "Perfil sin resumen estructurado.";
}

export default function RecruiterCandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const candidateId = typeof params?.id === "string" ? params.id : "";
  const jobId = searchParams.get("job_id") ?? "";

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [job, setJob] = useState<RecruiterJob | null>(null);
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "saved">("idle");

  const backHref = useMemo(
    () => (jobId ? `/recruiter/jobs/${jobId}/matches` : "/recruiter/shortlist"),
    [jobId]
  );
  const cvValid = isValidCvUrl(candidate?.cv_url ?? null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      if (!candidateId) {
        setStatus("not_found");
        return;
      }
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const [{ data: candidateData, error: candidateError }, { data: jobData, error: jobError }] =
          await Promise.all([
            supabase
              .from("candidate_profiles")
              .select(
                "id, full_name, email, whatsapp, city, target_role, years_experience, skills, expected_salary, work_mode, cv_url"
              )
              .eq("id", candidateId)
              .maybeSingle(),
            jobId
              ? supabase
                  .from("recruiter_jobs")
                  .select("id, job_title, company, description, industry")
                  .eq("id", jobId)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
          ]);

        if (!mounted) return;

        if (candidateError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/candidate-detail] candidate fetch failed", {
              table: "candidate_profiles",
              candidate_id: candidateId,
              message: candidateError.message,
              details: candidateError.details,
              hint: candidateError.hint,
              code: candidateError.code,
            });
          }
          setStatus("error");
          setErrorMessage(candidateError.message);
          return;
        }

        if (jobError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/candidate-detail] job fetch failed", {
              table: "recruiter_jobs",
              job_id: jobId,
              message: jobError.message,
              details: jobError.details,
              hint: jobError.hint,
              code: jobError.code,
            });
          }
        }

        if (!candidateData) {
          setStatus("not_found");
          return;
        }

        const normalizedCandidate: CandidateProfile = {
          id: String(candidateData.id),
          full_name: (candidateData.full_name as string | null) ?? null,
          email: (candidateData.email as string | null) ?? null,
          whatsapp: (candidateData.whatsapp as string | null) ?? null,
          city: (candidateData.city as string | null) ?? null,
          target_role: (candidateData.target_role as string | null) ?? null,
          years_experience: (candidateData.years_experience as number | null) ?? null,
          skills: (candidateData.skills as string | null) ?? null,
          expected_salary: (candidateData.expected_salary as number | null) ?? null,
          work_mode: (candidateData.work_mode as string | null) ?? null,
          cv_url: (candidateData.cv_url as string | null) ?? null,
        };
        setCandidate(normalizedCandidate);

        if (jobData) {
          setJob({
            id: String(jobData.id),
            job_title: (jobData.job_title as string | null) ?? null,
            company: (jobData.company as string | null) ?? null,
            description: (jobData.description as string | null) ?? null,
            industry: (jobData.industry as string | null) ?? null,
          });
        } else {
          setJob(null);
        }

        setStatus("success");
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      }
    }
    void loadData();
    return () => {
      mounted = false;
    };
  }, [candidateId, jobId]);

  useEffect(() => {
    let cancelled = false;
    async function loadAnalysis() {
      if (!candidate || !job) return;
      try {
        const result = await getJobMatchAnalysis({
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
        if (cancelled) return;
        setAnalysis(result);
      } catch {
        if (cancelled) return;
        setAnalysis(null);
      }
    }
    void loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [candidate, job]);

  async function handleSaveCandidate() {
    if (!candidate || !job) return;
    setSaveStatus("loading");
    try {
      const response = await fetch("/api/recruiter/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidate.id,
          job_id: job.id,
          notes: "",
          status: "saved",
        }),
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[recruiter/candidate-detail] save shortlist failed", {
            table: "recruiter_shortlist",
            payload: {
              candidate_id: candidate.id,
              job_id: job.id,
              notes: "",
              status: "saved",
            },
            response_status: response.status,
            response_body: payload,
          });
        }
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("idle");
    }
  }

  if (status === "loading") return <LoadingState />;
  if (status === "error") {
    return (
      <EmptyState
        title="No pudimos cargar el perfil"
        description={errorMessage ?? "Ocurrio un error inesperado."}
      />
    );
  }
  if (status === "not_found" || !candidate) {
    return (
      <EmptyState
        title="Candidato no encontrado"
        description="No encontramos este perfil de candidato."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="text-sm text-[#475569] hover:text-[#0F172A]">
            ← Volver a matches
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {job ? (
              <Button
                type="button"
                variant={saveStatus === "saved" ? "secondary" : "primary"}
                onClick={() => void handleSaveCandidate()}
                disabled={saveStatus === "loading" || saveStatus === "saved"}
              >
                {saveStatus === "saved"
                  ? "Candidato guardado"
                  : saveStatus === "loading"
                    ? "Guardando..."
                    : "Guardar candidato"}
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled>
                Guardar candidato
              </Button>
            )}
            <Link href="/recruiter/shortlist">
              <Button type="button" variant="secondary">
                Shortlist
              </Button>
            </Link>
            {job ? (
              <Link href={`/recruiter/jobs/${job.id}`}>
                <Button type="button" variant="secondary">
                  Ver vacante
                </Button>
              </Link>
            ) : (
              <Button type="button" variant="secondary" disabled>
                Ver vacante
              </Button>
            )}
          </div>
        </div>

        <PageHeader
          title={normalizeText(candidate.full_name) || "Candidato sin nombre"}
          description={normalizeText(candidate.target_role) || "Rol objetivo no especificado"}
        />

        <section className="ds-card p-6">
          <div className="grid gap-3 text-sm text-[#334155] md:grid-cols-2 lg:grid-cols-3">
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
            <p className="md:col-span-2 lg:col-span-3 text-sm text-[#475569]">
              {deriveCandidateSummary(candidate)}
            </p>
            {job ? (
              <p className="md:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#334155]">
                <span className="font-medium text-[#0F172A]">Contexto actual:</span>{" "}
                {job.job_title || "Vacante"} · {job.company || "Empresa no especificada"}
                {analysis
                  ? ` · Match ${analysis.match_score > 0 ? `${analysis.match_score}%` : "inicial"}`
                  : " · Compatibilidad por revisar"}
              </p>
            ) : null}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="ds-card p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#0F172A]">Resumen del candidato</h2>
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-[#475569]">
              {deriveCandidateSummary(candidate)}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[#334155] sm:grid-cols-2">
              <p>
                <span className="font-medium text-[#0F172A]">Rol objetivo:</span>{" "}
                {candidate.target_role || "No especificado"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Modalidad:</span>{" "}
                {candidate.work_mode || "No especificada"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Ciudad:</span>{" "}
                {candidate.city || "No especificada"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">Experiencia:</span>{" "}
                {typeof candidate.years_experience === "number"
                  ? `${candidate.years_experience} años`
                  : "No especificada"}
              </p>
            </div>
          </section>

          <section className="ds-card p-5">
            <h2 className="text-base font-semibold text-[#0F172A]">Contacto</h2>
            <div className="mt-3 space-y-2 text-sm text-[#334155]">
              <p>
                <span className="font-medium text-[#0F172A]">Email:</span>{" "}
                {candidate.email || "No disponible"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">WhatsApp:</span>{" "}
                {candidate.whatsapp || "No disponible"}
              </p>
              <p>
                <span className="font-medium text-[#0F172A]">CV:</span>{" "}
                {cvValid ? (
                  <a
                    href={candidate.cv_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3B4EFF] hover:underline"
                  >
                    Ver CV
                  </a>
                ) : (
                  "No disponible"
                )}
              </p>
            </div>
          </section>
        </div>

        <section className="ds-card p-5">
          <h2 className="text-base font-semibold text-[#0F172A]">Habilidades clave</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {normalizeText(candidate.skills)
              .split(",")
              .map((skill) => skill.trim())
              .filter(Boolean)
              .slice(0, 8)
              .map((skill, index) => (
                <span
                  key={`${skill}-${index}`}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {skill}
                </span>
              ))}
            {!normalizeText(candidate.skills) ? (
              <span className="text-sm text-[#64748B]">No se registraron habilidades.</span>
            ) : null}
          </div>
        </section>

        <section className="ds-card p-5">
          <h2 className="text-base font-semibold text-[#0F172A]">Compatibilidad con esta vacante</h2>
          {job ? (
            analysis ? (
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-[#334155]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Recomendación
                  </p>
                  <p className="mt-1 line-clamp-3">
                    Match: {analysis.match_score > 0 ? `${analysis.match_score}%` : "Inicial"} ·{" "}
                    {analysis.summary}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <p className="text-xs font-semibold uppercase tracking-wide">Fortalezas</p>
                  <ul className="mt-1 space-y-1">
                    {analysis.strengths.slice(0, 3).map((item, index) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    ))}
                    {analysis.strengths.length === 0 ? <li>• Por confirmar</li> : null}
                  </ul>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <p className="text-xs font-semibold uppercase tracking-wide">Riesgos</p>
                  <ul className="mt-1 space-y-1">
                    {analysis.gaps.slice(0, 3).map((item, index) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    ))}
                    {analysis.gaps.length === 0 ? <li>• Sin brechas relevantes detectadas</li> : null}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#64748B]">Compatibilidad por revisar.</p>
            )
          ) : (
            <p className="mt-3 text-sm text-[#64748B]">
              Abre este perfil desde la página de matches para ver el contexto de vacante.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
