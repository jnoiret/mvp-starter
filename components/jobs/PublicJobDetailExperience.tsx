"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginModal } from "@/components/auth/LoginModal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { getJobCardMetaLines } from "@/lib/jobs/jobCardDecisionSignals";
import type { PublicJobRow } from "@/lib/jobs/publicJob";
import { JobRequirementBreakdown } from "@/components/jobs/JobRequirementBreakdown";
import { buildAnonymousJobBreakdownPreview } from "@/lib/jobs/jobRequirementBreakdown";
import {
  getPublicJobTeaserBullets,
  getPublicListingProbabilityPreview,
  publicJobListingStarScore,
  publicListingSignalLine,
} from "@/lib/jobs/publicJobListingPreview";
import { savePostLoginJobRedirect } from "@/lib/auth/postLoginRedirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function toSkillListNormalized(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return value
    .split(",")
    .map((s) => s.trim())
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

type PublicJobDetailExperienceProps = {
  job: PublicJobRow;
};

export function PublicJobDetailExperience({ job }: PublicJobDetailExperienceProps) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  function openGatedLogin() {
    savePostLoginJobRedirect(job.id);
    setModalOpen(true);
  }

  const preview = getPublicListingProbabilityPreview(job);
  const meta = getJobCardMetaLines(job);
  const teaserBullets = getPublicJobTeaserBullets(job, 3);
  const skills = toSkillListNormalized(job.required_skills);
  const anonymousBreakdown = buildAnonymousJobBreakdownPreview(job);
  const listingStar = publicJobListingStarScore(job);
  useEffect(() => {
    let cancelled = false;

    async function routeIfCandidate() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) {
          if (!cancelled) setAuthReady(true);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (cancelled) return;

        if (profile?.role === "candidate") {
          router.replace(`/candidate/jobs/${job.id}`);
          return;
        }
      } catch {
        /* public view */
      }
      if (!cancelled) setAuthReady(true);
    }

    void routeIfCandidate();
    return () => {
      cancelled = true;
    };
  }, [router, job.id]);

  if (!authReady) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
      <Link
        href="/jobs"
        className="text-sm font-medium text-[#475569] hover:text-[#0F172A]"
      >
        ← Todas las vacantes
      </Link>

      <PageHeader
        title={job.title ?? "Vacante sin título"}
        description={job.company_name ?? "Empresa no especificada"}
      />

      <section className="ds-card p-6 lg:p-7">
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-zinc-100 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${preview.badgeClass}`}
              >
                {preview.label}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#64748B]">{preview.previewNote}</p>
            <p className="mt-2 text-xs font-medium text-[#475569]">
              {publicListingSignalLine(listingStar)}
            </p>
            <dl className="mt-4 grid gap-1.5 text-sm text-[#64748B]">
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
          </div>

          <JobRequirementBreakdown
            variant="anonymous"
            cumplesCon={anonymousBreakdown.cumplesCon}
            teFalta={anonymousBreakdown.teFalta}
            footnote={anonymousBreakdown.footnote}
          />

          <div className="rounded-xl border border-zinc-100 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Qué puedes ver sin iniciar sesión
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-snug text-[#334155]">
              {teaserBullets.map((line, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-[#94A3B8]" aria-hidden>
                    ·
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50/40 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.7)_0%,transparent_50%)]"
              aria-hidden
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700"
                    aria-hidden
                  >
                    Bloqueado
                  </span>
                  <p className="text-sm font-semibold text-[#312E81]">
                    Comparación con tu perfil
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#4338CA]">
                  Con sesión de candidato verás el desglose frente a tu perfil y contexto adicional
                  generado por IA — disponible al iniciar sesión.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              type="button"
              className="relative mt-4 w-full border-indigo-200 bg-white/95 text-indigo-900 shadow-sm hover:bg-white sm:w-auto"
              onClick={() => openGatedLogin()}
            >
              Desbloquear análisis
            </Button>
          </div>

          <div className="relative rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Análisis detallado
            </p>
            <p className="mt-2 text-sm text-[#64748B]">
              Vista detallada de encaje (rol, habilidades, experiencia) frente a tu perfil. Solo con
              sesión iniciada.
            </p>
            <button
              type="button"
              onClick={() => openGatedLogin()}
              className="mt-3 text-sm font-semibold text-[#4F46E5] underline decoration-indigo-200 underline-offset-2 hover:text-[#3730A3]"
            >
              Acceder con mi correo
            </button>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Descripción
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#0F172A]">
              {job.description?.trim() || "Sin descripción."}
            </p>
          </div>

          <div className="border-t border-zinc-100 pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[#475569]">
              Habilidades requeridas
            </p>
            {skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                  <span
                    key={`${skill}-${index}`}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {formatSkillLabelEs(skill)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#475569]">No especificadas.</p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-100 bg-[#F8FAFC] p-4">
          <p className="text-sm font-medium text-[#334155]">{preview.label}</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#475569]">
            {teaserBullets.slice(0, 3).map((line, idx) => (
              <li key={`apply-ctx-${idx}`} className="flex gap-2">
                <span className="shrink-0 text-[#94A3B8]" aria-hidden>
                  ·
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 text-center text-sm text-[#64748B]">
          Inicia sesión para completar tu postulación.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="primary"
            type="button"
            className="w-full sm:w-auto"
            onClick={() => openGatedLogin()}
          >
            Postularme a esta vacante
          </Button>
          <Link href="/jobs" className="w-full sm:w-auto">
            <Button variant="secondary" type="button" className="w-full">
              Ver más vacantes
            </Button>
          </Link>
        </div>
      </section>

      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
