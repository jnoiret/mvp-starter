import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  job_title: string | null;
  company: string | null;
  created_at: string | null;
};

export default async function RecruiterDashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: jobs, error } = await supabase
    .from("recruiter_jobs")
    .select("id, job_title, company, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const recentJobs: JobRow[] = (jobs ?? []) as JobRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">Panel reclutador</h1>
        <p className="mt-1 text-sm text-[#475569]">
          Accesos rápidos a vacantes y shortlist.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/recruiter/jobs/new"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#3B4EFF]/40 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-[#0F172A]">Crear vacante</p>
          <p className="mt-1 text-xs text-zinc-600">Publica un nuevo puesto</p>
        </Link>
        <Link
          href="/recruiter/shortlist"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#3B4EFF]/40 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-[#0F172A]">Shortlist</p>
          <p className="mt-1 text-xs text-zinc-600">Pipeline de candidatos</p>
        </Link>
        <Link
          href="/recruiter/jobs/new"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#3B4EFF]/40 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-[#0F172A]">Nueva búsqueda</p>
          <p className="mt-1 text-xs text-zinc-600">Ir al formulario de vacante</p>
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#0F172A]">
          Vacantes recientes
        </h2>
        {error ? (
          <p className="mt-3 text-sm text-rose-600">
            No se pudieron cargar las vacantes: {error.message}
          </p>
        ) : recentJobs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            Aún no hay vacantes.{" "}
            <Link href="/recruiter/jobs/new" className="font-medium text-[#3B4EFF]">
              Crear la primera
            </Link>
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {recentJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/recruiter/jobs/${job.id}`}
                  className="flex flex-col rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm transition hover:border-zinc-200"
                >
                  <span className="font-medium text-[#0F172A]">
                    {job.job_title ?? "Sin título"}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {job.company ?? "Empresa"} ·{" "}
                    {job.created_at
                      ? new Date(job.created_at).toLocaleDateString("es-MX")
                      : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
