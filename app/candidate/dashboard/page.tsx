/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
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
  created_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

export default function CandidateDashboardPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLatestProfile() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("candidate_profiles")
          .select(
            "id, full_name, email, whatsapp, city, target_role, years_experience, skills, expected_salary, work_mode, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(1);

        if (!isMounted) return;

        if (error) {
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }

        setProfile(data?.[0] ?? null);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error inesperado cargando el perfil."
        );
      }
    }

    loadLatestProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const completion = useMemo(() => {
    if (!profile) return { completed: 0, total: 9, percent: 0 };

    const fields = [
      profile.full_name,
      profile.email,
      profile.whatsapp,
      profile.city,
      profile.target_role,
      profile.years_experience,
      profile.skills,
      profile.expected_salary,
      profile.work_mode,
    ];
    const completed = fields.filter(
      (value) => value !== null && String(value).trim() !== ""
    ).length;
    const total = fields.length;
    const percent = Math.round((completed / total) * 100);
    return { completed, total, percent };
  }, [profile]);

  let content: React.ReactNode = null;

  if (status === "idle" || status === "loading") {
    content = <LoadingState />;
  } else if (status === "error") {
    content = (
      <EmptyState
        title="No pudimos cargar tu perfil"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  } else if (!profile) {
    content = (
      <EmptyState
        title="Todavía no hay perfil"
        description="Completa tu onboarding para ver tu información aquí."
        action={
          <Link href="/candidate/onboarding">
            <Button>Completar onboarding</Button>
          </Link>
        }
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        <section className="ds-card p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="ds-heading text-base font-semibold tracking-tight">
              Completitud de perfil
            </h2>
            <p className="text-sm text-[#475569]">
              {completion.completed}/{completion.total} campos
            </p>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-[#E2E8F0]">
            <div
              className="ds-accent-gradient h-2 rounded-full transition-all"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-[#475569]">{completion.percent}% completo</p>
        </section>

        <section className="ds-card p-6">
          <h2 className="ds-heading text-base font-semibold tracking-tight">
            Último perfil registrado
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Actualizado: {new Date(profile.created_at).toLocaleString()}
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[#475569]">Nombre completo</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.full_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Email</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">WhatsApp</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.whatsapp ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Ciudad</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.city ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Rol objetivo</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.target_role ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Años de experiencia</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">
                {profile.years_experience ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Skills</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.skills ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Salario esperado</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">
                {profile.expected_salary ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#475569]">Modalidad</dt>
              <dd className="mt-1 text-sm text-[#0F172A]">{profile.work_mode ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Un resumen rápido de tu búsqueda y tus siguientes pasos."
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

