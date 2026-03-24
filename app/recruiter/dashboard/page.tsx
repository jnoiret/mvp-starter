import Link from "next/link";
import { ProductEmptyState } from "@/components/shared/ProductEmptyState";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  job_title: string | null;
  company: string | null;
  created_at: string | null;
};

type ShortlistRow = {
  candidate_id: string;
  job_id: string;
  status: string | null;
  created_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  saved: "Guardado",
  reviewing: "En revisión",
  interview: "Entrevista",
  rejected: "Rechazado",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | "—";
  hint?: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#0F172A]">
        {value === "—" ? "—" : value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-snug text-zinc-500">{hint}</p>
      ) : null}
    </article>
  );
}

function QuickActionCard({
  href,
  title,
  description,
  disabled,
  disabledHint,
}: {
  href: string;
  title: string;
  description: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const inner = (
    <>
      <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
      <span className="mt-3 text-xs font-semibold text-indigo-600">
        {disabled ? (disabledHint ?? "Pronto") : "Abrir →"}
      </span>
    </>
  );

  if (disabled) {
    return (
      <div
        className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-5 opacity-80"
        title={disabledHint}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
    >
      {inner}
    </Link>
  );
}

export default async function RecruiterDashboardPage() {
  const supabase = await getSupabaseServerClient();

  const [
    jobsCountRes,
    shortlistTotalRes,
    shortlistSavedRes,
    shortlistActiveRes,
    jobsListRes,
    shortlistRecentOrdered,
  ] = await Promise.all([
    supabase.from("recruiter_jobs").select("*", { count: "exact", head: true }),
    supabase.from("recruiter_shortlist").select("*", { count: "exact", head: true }),
    supabase
      .from("recruiter_shortlist")
      .select("*", { count: "exact", head: true })
      .eq("status", "saved"),
    supabase
      .from("recruiter_shortlist")
      .select("*", { count: "exact", head: true })
      .in("status", ["reviewing", "interview"]),
    supabase
      .from("recruiter_jobs")
      .select("id, job_title, company, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("recruiter_shortlist")
      .select("candidate_id, job_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  let shortlistRows: ShortlistRow[] = [];
  if (shortlistRecentOrdered.error) {
    const fb = await supabase
      .from("recruiter_shortlist")
      .select("candidate_id, job_id, status")
      .limit(8);
    shortlistRows = (fb.data ?? []).map((r) => ({
      candidate_id: String(r.candidate_id ?? ""),
      job_id: String(r.job_id ?? ""),
      status: typeof r.status === "string" ? r.status : null,
      created_at: null,
    }));
  } else {
    shortlistRows = (shortlistRecentOrdered.data ?? []).map((r) => ({
      candidate_id: String(r.candidate_id ?? ""),
      job_id: String(r.job_id ?? ""),
      status: typeof r.status === "string" ? r.status : null,
      created_at:
        typeof r.created_at === "string" && r.created_at ? r.created_at : null,
    }));
  }

  const candidateIds = Array.from(
    new Set(shortlistRows.map((r) => r.candidate_id).filter(Boolean)),
  );
  const jobIdsShort = Array.from(
    new Set(shortlistRows.map((r) => r.job_id).filter(Boolean)),
  );

  const [{ data: candidatesData }, { data: jobsLookupData }] = await Promise.all([
    candidateIds.length > 0
      ? supabase
          .from("candidate_profiles")
          .select("id, full_name, email")
          .in("id", candidateIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    jobIdsShort.length > 0
      ? supabase
          .from("recruiter_jobs")
          .select("id, job_title, company")
          .in("id", jobIdsShort)
      : Promise.resolve({ data: [] as { id: string; job_title: string | null; company: string | null }[] }),
  ]);

  const nameByCandidate = new Map<string, string>();
  for (const c of candidatesData ?? []) {
    const id = String(c.id ?? "");
    const name = (c.full_name ?? "").trim() || (c.email ?? "").trim();
    if (id && name) nameByCandidate.set(id, name);
  }
  const jobMetaById = new Map<string, { title: string; company: string }>();
  for (const j of jobsLookupData ?? []) {
    const id = String(j.id ?? "");
    if (!id) continue;
    jobMetaById.set(id, {
      title: (j.job_title ?? "").trim() || "Vacante sin título",
      company: (j.company ?? "").trim() || "—",
    });
  }

  const recentJobs: JobRow[] = (jobsListRes.data ?? []) as JobRow[];
  const jobsError = jobsListRes.error;
  const activeJobsCount =
    typeof jobsCountRes.count === "number" ? jobsCountRes.count : 0;
  const shortlistTotal =
    typeof shortlistTotalRes.count === "number" ? shortlistTotalRes.count : 0;
  const savedCount =
    typeof shortlistSavedRes.count === "number" ? shortlistSavedRes.count : 0;
  const reviewingInterviewCount =
    typeof shortlistActiveRes.count === "number" ? shortlistActiveRes.count : 0;

  const latestJobId = recentJobs[0]?.id ?? null;
  const matchesHref = latestJobId
    ? `/recruiter/jobs/${latestJobId}/matches`
    : "";

  const kpiError =
    jobsCountRes.error?.message ||
    shortlistTotalRes.error?.message ||
    null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 border-b border-zinc-200/80 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-[1.65rem]">
            Tu panel de reclutamiento
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Publica vacantes, revisa matches y lleva el shortlist en un solo lugar.
          </p>
        </div>
        <Link
          href="/recruiter/jobs/new"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-white shadow-sm transition",
            "ds-accent-gradient hover:brightness-95 active:brightness-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B4EFF] focus-visible:ring-offset-2",
          )}
        >
          Crear vacante
        </Link>
      </header>

      {kpiError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Algunos datos no cargaron: {kpiError}
        </p>
      ) : null}

      <section aria-label="Indicadores">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Vacantes activas"
            value={activeJobsCount}
            hint="Publicadas en tu espacio"
          />
          <KpiCard
            label="Candidatos guardados"
            value={savedCount}
            hint="Estado «Guardado»"
          />
          <KpiCard
            label="Shortlist"
            value={shortlistTotal}
            hint="Total en pipeline"
          />
          <KpiCard
            label="Revisión y entrevistas"
            value={reviewingInterviewCount}
            hint="En revisión + entrevista"
          />
        </div>
      </section>

      {activeJobsCount === 0 && !jobsError ? (
        <ProductEmptyState
          title="Aún no has creado vacantes"
          subtitle="Crea tu primera vacante y empieza a recibir candidatos relevantes."
          ctaLabel="Crear vacante"
          ctaHref="/recruiter/jobs/new"
          icon="search"
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Vacantes recientes
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Últimas publicaciones
              </p>
            </div>
          </div>

          {jobsError ? (
            <p className="mt-4 text-sm text-rose-600">
              No se pudieron cargar las vacantes: {jobsError.message}
            </p>
          ) : recentJobs.length === 0 ? (
            <div className="mt-4">
              <ProductEmptyState
                className="!border-0 !bg-transparent !from-transparent !to-transparent !px-4 !py-8 !shadow-none"
                title="Sin vacantes aún"
                subtitle="Publica una vacante para verla aquí con accesos rápidos."
                ctaLabel="Crear vacante"
                ctaHref="/recruiter/jobs/new"
                icon="search"
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {recentJobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4"
                >
                  <p className="font-medium text-[#0F172A]">
                    {job.job_title ?? "Sin título"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {job.company ?? "Empresa"} · {formatDate(job.created_at)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/recruiter/jobs/${job.id}`}
                      className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition hover:border-zinc-300"
                    >
                      Ver vacante
                    </Link>
                    <Link
                      href={`/recruiter/jobs/${job.id}/matches`}
                      className="inline-flex rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:border-indigo-300"
                    >
                      Ver matches
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">
              Shortlist reciente
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Últimos candidatos añadidos
            </p>
          </div>

          {shortlistRows.length === 0 ? (
            <div className="mt-4">
              <ProductEmptyState
                className="!border-0 !bg-transparent !from-transparent !to-transparent !px-4 !py-8 !shadow-none"
                title="Aún no tienes candidatos guardados"
                subtitle="Explora perfiles y guarda los candidatos que te interesen."
                ctaLabel={latestJobId ? "Ver candidatos" : "Crear vacante"}
                ctaHref={
                  latestJobId
                    ? `/recruiter/jobs/${latestJobId}/matches`
                    : "/recruiter/jobs/new"
                }
                icon="people"
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {shortlistRows.map((row) => {
                const name =
                  nameByCandidate.get(row.candidate_id) ?? "Candidato";
                const meta = jobMetaById.get(row.job_id);
                const jobLine = meta
                  ? `${meta.title} · ${meta.company}`
                  : "Vacante";
                const statusLabel =
                  STATUS_LABELS[row.status ?? ""] ?? row.status ?? "—";
                return (
                  <li
                    key={`${row.candidate_id}-${row.job_id}`}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4"
                  >
                    <p className="font-medium text-[#0F172A]">{name}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{jobLine}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      {statusLabel}
                      {row.created_at ? ` · ${formatDate(row.created_at)}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/recruiter/candidates/${row.candidate_id}`}
                        className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition hover:border-zinc-300"
                      >
                        Ver perfil
                      </Link>
                      <Link
                        href="/recruiter/shortlist"
                        className="inline-flex rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:border-indigo-300"
                      >
                        Ver shortlist
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Accesos rápidos">
        <h2 className="text-base font-semibold text-[#0F172A]">
          Acciones rápidas
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <QuickActionCard
            href="/recruiter/jobs/new"
            title="Crear vacante"
            description="Publica un nuevo puesto y empieza a recibir candidatos."
          />
          <QuickActionCard
            href="/recruiter/shortlist"
            title="Ver shortlist"
            description="Gestiona estados y notas del pipeline."
          />
          <QuickActionCard
            href={matchesHref || "#"}
            title="Revisar matches recientes"
            description="Abre los matches de tu vacante más reciente."
            disabled={!latestJobId}
            disabledHint="Crea una vacante para ver matches"
          />
        </div>
      </section>
    </div>
  );
}
