"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AdminDashboardLoadResult,
  DashboardMetrics,
} from "@/lib/admin/dashboardMetrics";

function formatNumber(n: number) {
  return new Intl.NumberFormat("es-MX").format(n);
}

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function KpiCard(props: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {props.label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-[#0F172A]">
        {props.value}
      </p>
      {props.hint ? (
        <p className="mt-1 text-xs text-zinc-500">{props.hint}</p>
      ) : null}
    </div>
  );
}

function FunnelStage(props: {
  label: string;
  value: number | null;
  max: number;
  isOptional?: boolean;
}) {
  const safeMax = Math.max(props.max, 1);
  const display = props.value == null ? "—" : formatNumber(props.value);
  const widthPct =
    props.value == null ? 8 : Math.max(8, (props.value / safeMax) * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-[#334155]">
          {props.label}
          {props.isOptional ? (
            <span className="ml-1 font-normal text-zinc-400">(eventos)</span>
          ) : null}
        </span>
        <span className="tabular-nums text-[#0F172A]">{display}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[#3B4EFF]/90 transition-[width]"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[#0F172A]">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function RecentList(props: {
  empty: string;
  children: React.ReactNode;
  hasRows: boolean;
}) {
  if (!props.hasRows) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-600">
        {props.empty}
      </p>
    );
  }
  return <ul className="flex flex-col gap-3">{props.children}</ul>;
}

function DashboardContent({ data }: { data: DashboardMetrics }) {
  const { kpis, funnel, insights } = data;
  const funnelMax = Math.max(
    funnel.registered,
    funnel.onboardingComplete,
    funnel.viewedJobsEvents ?? 0,
    funnel.savedApplications,
    funnel.appliedApplications,
    1
  );

  const hasAnyActivity =
    kpis.usersRegistered > 0 ||
    kpis.recruiterJobsCreated > 0 ||
    kpis.applicationsSaved > 0 ||
    kpis.applicationsApplied > 0;

  return (
    <>
      {data.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Avisos</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900/90">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/80 p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">
            Usuarios y permisos
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            Asigna roles en la tabla{" "}
            <code className="rounded bg-white/80 px-1 text-[11px]">profiles</code>
          </p>
        </div>
        <Link
          href="/admin/users"
          className="inline-flex items-center justify-center rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
        >
          Gestionar usuarios
        </Link>
      </div>

      {!hasAnyActivity ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/90 px-4 py-6 text-center text-sm text-zinc-600">
          Aún no hay actividad registrada en las tablas. Cuando haya candidatos,
          vacantes o postulaciones, los indicadores se llenarán automáticamente.
        </p>
      ) : null}

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          KPIs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            label="Usuarios registrados"
            value={formatNumber(kpis.usersRegistered)}
            hint="Filas en candidate_profiles"
          />
          <KpiCard
            label="Onboarding completado"
            value={formatNumber(kpis.onboardingCompleted)}
            hint="Perfil con email y datos clave (nombre, rol o experiencia)"
          />
          <KpiCard
            label="Vacantes vistas"
            value={
              kpis.jobViewsAvailable && kpis.jobViewsTotal != null
                ? formatNumber(kpis.jobViewsTotal)
                : "N/D"
            }
            hint={
              kpis.jobViewsAvailable
                ? "Registros en candidate_job_views"
                : "Tabla no disponible o sin acceso"
            }
          />
          <KpiCard
            label="Vacantes guardadas"
            value={formatNumber(kpis.applicationsSaved)}
            hint="applications con status = saved"
          />
          <KpiCard
            label="Postulaciones"
            value={formatNumber(kpis.applicationsApplied)}
            hint="applications con status = applied"
          />
          <KpiCard
            label="Vacantes creadas (reclutador)"
            value={formatNumber(kpis.recruiterJobsCreated)}
            hint="Filas en recruiter_jobs"
          />
        </div>
      </div>

      <SectionCard title="Embudo (aproximación con datos disponibles)">
        <p className="mb-6 text-sm text-zinc-600">
          Cada etapa usa conteos reales: usuarios y perfiles completos son
          candidatos; las vistas son eventos totales en{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">candidate_job_views</code>
          ; guardados y postulaciones son filas en{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">applications</code>.
        </p>
        <div className="flex flex-col gap-4">
          <FunnelStage
            label="Usuarios registrados"
            value={funnel.registered}
            max={funnelMax}
          />
          <FunnelStage
            label="Onboarding completo"
            value={funnel.onboardingComplete}
            max={funnelMax}
          />
          <FunnelStage
            label="Vieron vacantes"
            value={funnel.viewedJobsEvents}
            max={funnelMax}
            isOptional
          />
          <FunnelStage
            label="Guardaron vacantes"
            value={funnel.savedApplications}
            max={funnelMax}
          />
          <FunnelStage
            label="Postularon"
            value={funnel.appliedApplications}
            max={funnelMax}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Últimas postulaciones">
          <RecentList
            hasRows={data.recentApplied.length > 0}
            empty="Sin postulaciones recientes."
          >
            {data.recentApplied.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
              >
                <p className="font-medium text-[#0F172A]">
                  {row.title ?? "Vacante"}
                  {row.company_name ? (
                    <span className="font-normal text-zinc-600">
                      {" "}
                      · {row.company_name}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {row.candidate_email ?? "Email no disponible"} ·{" "}
                  {formatShortDate(row.created_at)}
                </p>
                {row.job_id ? (
                  <Link
                    href={`/candidate/jobs/${row.job_id}`}
                    className="mt-1 inline-block text-xs font-medium text-[#3B4EFF] hover:underline"
                  >
                    Ver vacante (candidato)
                  </Link>
                ) : null}
              </li>
            ))}
          </RecentList>
        </SectionCard>

        <SectionCard title="Últimas vacantes creadas">
          <RecentList
            hasRows={data.recentRecruiterJobs.length > 0}
            empty="Sin vacantes de reclutador recientes."
          >
            {data.recentRecruiterJobs.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
              >
                <Link
                  href={`/recruiter/jobs/${row.id}`}
                  className="font-medium text-[#0F172A] hover:text-[#3B4EFF]"
                >
                  {row.job_title ?? "Sin título"}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {row.company ?? "Empresa —"} · {formatShortDate(row.created_at)}
                </p>
              </li>
            ))}
          </RecentList>
        </SectionCard>

        <SectionCard title="Últimos en shortlist">
          <RecentList
            hasRows={data.recentShortlist.length > 0}
            empty="Sin entradas en recruiter_shortlist."
          >
            {data.recentShortlist.map((row) => (
              <li
                key={`${row.candidate_id}-${row.job_id}`}
                className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm"
              >
                <p className="font-medium text-[#0F172A]">
                  {row.candidate_name ?? "Candidato"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {row.job_title ?? "Vacante"} ·{" "}
                  <span className="capitalize">{row.status ?? "—"}</span>
                  {row.created_at ? ` · ${formatShortDate(row.created_at)}` : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Link
                    href={`/recruiter/candidates/${row.candidate_id}?job_id=${encodeURIComponent(row.job_id)}`}
                    className="text-xs font-medium text-[#3B4EFF] hover:underline"
                  >
                    Perfil
                  </Link>
                  <Link
                    href={`/recruiter/jobs/${row.job_id}`}
                    className="text-xs font-medium text-[#3B4EFF] hover:underline"
                  >
                    Vacante
                  </Link>
                </div>
              </li>
            ))}
          </RecentList>
        </SectionCard>
      </div>

      <SectionCard title="Insights rápidos">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Vistas / usuario (aprox.)
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#0F172A]">
              {insights.avgJobViewsPerViewer != null
                ? insights.avgJobViewsPerViewer
                : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Total de vistas ÷ usuarios únicos con vista (muestra acotada si hay
              muchos registros).
            </p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Ratio postulaciones / guardados
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-[#0F172A]">
              {insights.appliedToSavedRatio != null
                ? insights.appliedToSavedRatio
                : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Filas <code className="text-[11px]">applied</code> ÷ filas{" "}
              <code className="text-[11px]">saved</code>. Sin guardados no aplica.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 md:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Top vacantes por postulaciones
            </p>
            {insights.topJobsByApplications.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">
                Sin datos de postulaciones con job_id.
              </p>
            ) : (
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-[#334155]">
                {insights.topJobsByApplications.map((job) => (
                  <li key={job.job_id}>
                    <span className="font-medium text-[#0F172A]">
                      {job.title ?? "Vacante"}
                    </span>
                    {job.company_name ? (
                      <span className="text-zinc-600"> · {job.company_name}</span>
                    ) : null}
                    <span className="ml-1 tabular-nums text-zinc-500">
                      ({formatNumber(job.count)})
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </SectionCard>
    </>
  );
}

export function AdminDashboardView({
  result,
  devSimulatedEmail,
}: {
  result: AdminDashboardLoadResult;
  devSimulatedEmail?: string;
}) {
  const showDevBypassBanner =
    process.env.NODE_ENV === "development" && Boolean(devSimulatedEmail);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8 pb-14 pt-4">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-zinc-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Admin
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
              Dashboard de producto
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#475569]">
              Salud del producto, actividad y embudo a partir de tablas reales en
              Supabase (sin datos de demostración).
            </p>
            {showDevBypassBanner ? (
              <p className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-950">
                <span className="font-semibold">Modo desarrollo:</span> acceso sin auth.
                Usuario simulado: {devSimulatedEmail}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-[#0F172A] shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
            >
              Perfiles candidatos
            </Link>
          </div>
        </header>

        {!result.ok ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center">
            <p className="font-semibold text-rose-900">
              {result.kind === "config"
                ? "Configuración de servidor"
                : "Error de base de datos"}
            </p>
            <p className="mt-2 text-sm text-rose-800/90">{result.message}</p>
            {result.kind === "config" ? (
              <p className="mt-4 text-xs text-rose-700/80">
                Comprueba{" "}
                <code className="rounded bg-white/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
                y URL en el entorno del servidor.
              </p>
            ) : null}
          </div>
        ) : (
          <DashboardContent data={result.data} />
        )}
      </div>
    </div>
  );
}
