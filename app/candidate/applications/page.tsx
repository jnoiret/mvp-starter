"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ProductEmptyState } from "@/components/shared/ProductEmptyState";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Tab = "saved" | "applied";
type TrackerStatus =
  | "saved"
  | "applied"
  | "viewed_by_company"
  | "interview"
  | "rejected"
  | "offer";

type ApplicationRecordRaw = {
  id: string;
  job_id: string | null;
  job_listing_id: string | null;
  candidate_email: string | null;
  status: string | null;
  created_at: string | null;
  title: string | null;
  company_name: string | null;
};

type JobListing = {
  id: string;
  title: string;
  company_name: string;
  city: string | null;
  salary_range: string | null;
  work_mode: string | null;
  description: string | null;
};

type ApplicationCard = {
  id: string;
  status: TrackerStatus;
  job_id: string | null;
  candidate_email: string | null;
  title: string;
  company_name: string;
  city: string | null;
  salary_range: string | null;
  work_mode: string | null;
  description: string | null;
  created_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

const STATUS_STYLES: Record<TrackerStatus, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-emerald-100 text-emerald-700",
  viewed_by_company: "bg-blue-100 text-blue-700",
  interview: "bg-violet-100 text-violet-700",
  rejected: "bg-rose-100 text-rose-700",
  offer: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<TrackerStatus, string> = {
  saved: "Guardado",
  applied: "Postulado",
  viewed_by_company: "Visto por empresa",
  interview: "Entrevista",
  rejected: "No seleccionado",
  offer: "Oferta",
};

const STATUS_PRIORITY: Record<TrackerStatus, number> = {
  offer: 6,
  interview: 5,
  viewed_by_company: 4,
  applied: 3,
  rejected: 2,
  saved: 1,
};

function normalizeTrackerStatus(value: string | null): TrackerStatus | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (
    lower === "saved" ||
    lower === "applied" ||
    lower === "viewed_by_company" ||
    lower === "interview" ||
    lower === "rejected" ||
    lower === "offer"
  ) {
    return lower;
  }
  return null;
}

function formatFriendlyDate(status: TrackerStatus, value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfTarget.getTime()) / (1000 * 60 * 60 * 24)
  );

  const verb =
    status === "saved"
      ? "Guardaste"
      : status === "applied"
        ? "Postulaste"
        : status === "viewed_by_company"
          ? "La empresa la vio"
          : status === "interview"
            ? "Actualizada a entrevista"
            : status === "offer"
              ? "Recibiste oferta"
              : "Actualizada";

  if (diffDays === 0) return `${verb} hoy`;
  if (diffDays === 1) return `${verb} ayer`;

  const day = date.getDate();
  const month = date.toLocaleDateString("es-MX", { month: "short" });
  const monthFormatted = month.charAt(0).toUpperCase() + month.slice(1).replace(".", "");
  return `${verb} el ${day} ${monthFormatted}`;
}

export default function CandidateApplicationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidateEmail, setCandidateEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<ApplicationCard[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("applied");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  async function loadApplicationsForCurrentCandidate() {
    setStatus("loading");
    setErrorMessage(null);
    setActionFeedback(null);

    try {
      const supabase = getSupabaseBrowserClient();

      // Prefer authenticated user email, fallback to latest candidate profile email.
      const [{ data: authData }, { data: profileData, error: profileError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from("candidate_profiles")
            .select("email")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (profileError) {
        setStatus("error");
        setErrorMessage(profileError.message);
        return;
      }

      const email =
        authData.user?.email?.trim() ?? profileData?.email?.trim() ?? null;

      if (!email) {
        setStatus("success");
        setRows([]);
        setCandidateEmail(null);
        return;
      }

      setCandidateEmail(email);

      const { data: appsData, error: appsError } = await supabase
        .from("applications")
        .select("*")
        .eq("candidate_email", email)
        .order("created_at", { ascending: false });

      if (appsError) {
        setStatus("error");
        setErrorMessage(appsError.message);
        return;
      }

      const applications: ApplicationRecordRaw[] = (appsData ?? []).map((item) => ({
        id: String(item.id),
        job_id: (item.job_id as string | null) ?? null,
        job_listing_id: (item.job_listing_id as string | null) ?? null,
        candidate_email: (item.candidate_email as string | null) ?? null,
        status: (item.status as string | null) ?? null,
        created_at: (item.created_at as string | null) ?? null,
        title: (item.title as string | null) ?? null,
        company_name: (item.company_name as string | null) ?? null,
      }));

      const jobIds = Array.from(
        new Set(
          applications
            .map((app) => app.job_id ?? app.job_listing_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let jobsById = new Map<string, JobListing>();
      if (jobIds.length > 0) {
        const { data: jobsData, error: jobsError } = await supabase
          .from("job_listings")
          .select(
            "id, title, company_name, city, salary_range, work_mode, description"
          )
          .in("id", jobIds);

        if (jobsError) {
          setStatus("error");
          setErrorMessage(jobsError.message);
          return;
        }

        jobsById = new Map(
          (jobsData ?? []).map((job) => [
            String(job.id),
            {
              id: String(job.id),
              title: (job.title as string | null) ?? "Vacante sin título",
              company_name:
                (job.company_name as string | null) ?? "Empresa no especificada",
              city: (job.city as string | null) ?? null,
              salary_range: (job.salary_range as string | null) ?? null,
              work_mode: (job.work_mode as string | null) ?? null,
              description: (job.description as string | null) ?? null,
            },
          ])
        );
      }

      const groupedByJob = new Map<
        string,
        Array<{ status: TrackerStatus; row: ApplicationRecordRaw }>
      >();

      for (const app of applications) {
        const normalized = normalizeTrackerStatus(app.status);
        const refId = app.job_id ?? app.job_listing_id;
        if (!normalized || !refId) continue;

        const group = groupedByJob.get(refId) ?? [];
        group.push({ status: normalized, row: app });
        groupedByJob.set(refId, group);
      }

      const mappedRows: ApplicationCard[] = Array.from(groupedByJob.entries())
        .map(([refId, group]) => {
          const effectiveItem = [...group].sort((a, b) => {
            const priorityDiff = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
            if (priorityDiff !== 0) return priorityDiff;
            const timeA = a.row.created_at ? new Date(a.row.created_at).getTime() : 0;
            const timeB = b.row.created_at ? new Date(b.row.created_at).getTime() : 0;
            return timeB - timeA;
          })[0];
          if (!effectiveItem) return null;

          const linkedJob = jobsById.get(refId);
          return {
            id: effectiveItem.row.id,
            status: effectiveItem.status,
            job_id: refId,
            candidate_email: effectiveItem.row.candidate_email,
            title: linkedJob?.title ?? effectiveItem.row.title ?? "Vacante sin título",
            company_name:
              linkedJob?.company_name ??
              effectiveItem.row.company_name ??
              "Empresa no especificada",
            city: linkedJob?.city ?? null,
            salary_range: linkedJob?.salary_range ?? null,
            work_mode: linkedJob?.work_mode ?? null,
            description: linkedJob?.description ?? null,
            created_at: effectiveItem.row.created_at ?? "",
          };
        })
        .filter((row): row is ApplicationCard => row !== null)
        .sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
        });

      setRows(mappedRows);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado cargando postulaciones."
      );
    }
  }

  useEffect(() => {
    void loadApplicationsForCurrentCandidate();
  }, []);

  async function handleRemoveSaved(row: ApplicationCard) {
    setRemovingId(row.id);
    setActionFeedback(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const emailForDelete = candidateEmail ?? row.candidate_email;
      if (!emailForDelete || !row.job_id) {
        setActionFeedback(
          "No pudimos identificar correctamente la vacante guardada para eliminar."
        );
        return;
      }

      console.log("[applications] removing saved row", {
        id: row.id,
        candidate_email: emailForDelete,
        job_id: row.job_id,
        status: "saved",
      });

      const { data: deletedRows, error } = await supabase
        .from("applications")
        .delete()
        .eq("candidate_email", emailForDelete)
        .eq("job_id", row.job_id)
        .eq("status", "saved")
        .select("id, candidate_email, job_id, status");

      console.log("[applications] remove saved response", {
        deletedRows,
        error,
      });

      if (error) {
        setActionFeedback(error.message);
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        setActionFeedback(
          "No se pudo eliminar en base de datos. Intenta recargar y volver a intentar."
        );
        return;
      }

      const deletedIds = new Set(deletedRows.map((item) => String(item.id)));
      setRows((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setActionFeedback("Vacante quitada de guardadas.");
    } catch (err) {
      setActionFeedback(
        err instanceof Error
          ? err.message
          : "No pudimos quitar la vacante de guardadas."
      );
    } finally {
      setRemovingId(null);
    }
  }

  const filteredRows = rows.filter((row) =>
    activeTab === "saved" ? row.status === "saved" : row.status !== "saved"
  );

  let content: React.ReactNode = null;

  if (status === "idle" || status === "loading") {
    content = <LoadingState />;
  } else if (status === "error") {
    content = (
      <EmptyState
        title="No pudimos cargar tus postulaciones"
        description={errorMessage ?? "Ocurrió un error inesperado."}
      />
    );
  } else if (!candidateEmail) {
    content = (
      <ProductEmptyState
        title="Tu perfil aún no está listo"
        subtitle="Genera tu perfil con IA para empezar a recibir vacantes con mayor probabilidad de respuesta."
        ctaLabel="Crear perfil con IA"
        ctaHref="/onboarding"
        icon="profile"
      />
    );
  } else if (filteredRows.length === 0) {
    content =
      activeTab === "saved" ? (
        <ProductEmptyState
          title="Aún no has guardado vacantes"
          subtitle="Explora la lista y guarda las que quieras revisar con calma."
          ctaLabel="Explorar vacantes"
          ctaHref="/candidate/jobs"
          icon="inbox"
        />
      ) : (
        <ProductEmptyState
          title="Aún no has aplicado a ninguna vacante"
          subtitle="Explora oportunidades donde tienes mayor probabilidad de avanzar."
          ctaLabel="Explorar vacantes"
          ctaHref="/candidate/jobs"
          icon="search"
        />
      );
  } else {
    content = (
      <section className="grid gap-4 sm:gap-5">
        {filteredRows.map((row) => (
          <article
            key={row.id}
            role={row.job_id ? "button" : undefined}
            tabIndex={row.job_id ? 0 : undefined}
            onClick={() => {
              if (!row.job_id) return;
              router.push(`/candidate/jobs/${row.job_id}`);
            }}
            onKeyDown={(event) => {
              if (!row.job_id) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/candidate/jobs/${row.job_id}`);
              }
            }}
            className={`ds-card border-l-4 p-5 sm:p-6 ${
              row.status === "saved"
                ? "border-l-slate-200"
                : row.status === "applied"
                  ? "border-l-emerald-400"
                  : row.status === "viewed_by_company"
                    ? "border-l-blue-400"
                    : row.status === "interview"
                      ? "border-l-violet-400"
                      : row.status === "offer"
                        ? "border-l-amber-400"
                        : "border-l-rose-400"
            }`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ds-heading text-lg font-semibold leading-tight tracking-tight">
                    {row.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#475569]">{row.company_name}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    STATUS_STYLES[row.status]
                  }`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#475569]">
                <p>{row.city ?? "Ubicación no especificada"}</p>
                {row.salary_range ? <p>{row.salary_range}</p> : null}
                <p>Modalidad: {row.work_mode ?? "No especificada"}</p>
              </div>

              <p className="text-sm leading-relaxed text-[#0F172A]">
                {row.description ?? "Sin descripción."}
              </p>

              <p className="text-xs text-[#475569]">
                {row.created_at
                  ? formatFriendlyDate(row.status, row.created_at)
                  : "Fecha no disponible"}
              </p>

              <div className="mt-2 border-t border-zinc-100 pt-4">
                <div className="rounded-2xl bg-[#F8FAFF] p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    {row.status === "saved" ? (
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveSaved(row);
                        }}
                        disabled={removingId === row.id}
                      >
                        {removingId === row.id ? "Quitando..." : "Quitar de guardadas"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Mis vacantes"
        description="Aquí puedes ver las vacantes que guardaste o a las que ya te postulaste."
        action={
          <Link href="/candidate/jobs">
            <Button variant="secondary">Explorar vacantes</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("applied")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === "applied"
              ? "bg-emerald-600 text-white"
              : "border border-zinc-200 bg-white text-[#0F172A]"
          }`}
        >
          Postuladas ({rows.filter((row) => row.status !== "saved").length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("saved")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            activeTab === "saved"
              ? "bg-slate-900 text-white"
              : "border border-zinc-200 bg-white text-[#0F172A]"
          }`}
        >
          Guardadas ({rows.filter((row) => row.status === "saved").length})
        </button>
      </div>

      {actionFeedback ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-[#475569]">
          {actionFeedback}
        </p>
      ) : null}

      {content}
    </div>
  );
}

