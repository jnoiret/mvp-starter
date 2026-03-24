import Link from "next/link";
import type { PublicJobRow } from "@/lib/jobs/publicJob";
import {
  formatLocationLine,
  skillsTeaser,
  truncateText,
} from "@/lib/jobs/publicJob";

type PublicJobCardProps = {
  job: PublicJobRow;
  excerptLength?: number;
};

export function PublicJobCard({
  job,
  excerptLength = 160,
}: PublicJobCardProps) {
  const title = job.title?.trim() || "Vacante";
  const company = job.company_name?.trim() || "Empresa";
  const location = formatLocationLine(job.city, job.work_mode);
  const excerpt = truncateText(job.description, excerptLength);
  const skills = skillsTeaser(job.required_skills);
  const nextParam = encodeURIComponent(`/jobs?job=${job.id}`);
  const loginHref = `/login?next=${nextParam}`;

  return (
    <article className="ds-card flex flex-col gap-4 p-6">
      <div>
        <h2 className="ds-heading text-lg font-semibold tracking-tight text-[#0F172A]">
          {title}
        </h2>
        <p className="mt-1 text-sm font-medium text-zinc-700">{company}</p>
        {location ? (
          <p className="mt-1 text-sm text-zinc-500">{location}</p>
        ) : null}
        {job.salary_range?.trim() ? (
          <p className="mt-1 text-xs text-zinc-500">{job.salary_range.trim()}</p>
        ) : null}
      </div>

      {excerpt ? (
        <p className="text-sm leading-relaxed text-zinc-600">{excerpt}</p>
      ) : null}

      {skills ? (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">Stack: </span>
          {skills}
        </p>
      ) : null}

      <p className="text-xs text-zinc-400">
        Probabilidad de respuesta personalizada con IA al iniciar sesión.
      </p>

      <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Link
          href={`/jobs?job=${encodeURIComponent(job.id)}`}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-[#0F172A] shadow-sm hover:bg-zinc-50"
        >
          Ver detalles
        </Link>
        <Link
          href={loginHref}
          className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-zinc-900"
        >
          Postularme a esta vacante
        </Link>
      </div>
    </article>
  );
}
