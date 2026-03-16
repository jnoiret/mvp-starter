/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

type ApplicationItem = {
  id: string;
  status: ApplicationStatus | string | null;
  created_at: string | null;
  job_listing_id: string | null;
  job_id: string | null;
  title: string | null;
  company_name: string | null;
};

type JobLookup = {
  id: string;
  title: string | null;
  company_name: string | null;
};

type Row = {
  id: string;
  title: string;
  company_name: string;
  status: string;
  created_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

const STATUS_STYLES: Record<string, string> = {
  saved: "bg-slate-100 text-slate-700",
  applied: "bg-blue-100 text-blue-700",
  interview: "bg-amber-100 text-amber-700",
  offer: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

function normalizeStatus(value: string | null) {
  if (!value) return "saved";
  const lower = value.toLowerCase();
  if (lower === "saved") return "saved";
  if (lower === "applied") return "applied";
  if (lower === "interview") return "interview";
  if (lower === "offer") return "offer";
  if (lower === "rejected") return "rejected";
  return lower;
}

export default function CandidateApplicationsPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadApplications() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("applications")
          .select("*")
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error) {
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }

        const applications: ApplicationItem[] = (data ?? []).map((item) => ({
          id: String(item.id ?? crypto.randomUUID()),
          status: (item.status as string | null) ?? null,
          created_at: (item.created_at as string | null) ?? null,
          job_listing_id: (item.job_listing_id as string | null) ?? null,
          job_id: (item.job_id as string | null) ?? null,
          title: (item.title as string | null) ?? null,
          company_name: (item.company_name as string | null) ?? null,
        }));

        const jobIds = Array.from(
          new Set(
            applications
              .map((app) => app.job_listing_id ?? app.job_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        let jobsById = new Map<string, JobLookup>();
        if (jobIds.length > 0) {
          const { data: jobsData, error: jobsError } = await supabase
            .from("job_listings")
            .select("id, title, company_name")
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
                title: (job.title as string | null) ?? null,
                company_name: (job.company_name as string | null) ?? null,
              },
            ])
          );
        }

        const mappedRows: Row[] = applications.map((app) => {
          const refId = app.job_listing_id ?? app.job_id;
          const linkedJob = refId ? jobsById.get(refId) : undefined;
          const normalizedStatus = normalizeStatus(app.status);
          return {
            id: app.id,
            title: linkedJob?.title ?? app.title ?? "Vacante sin título",
            company_name:
              linkedJob?.company_name ?? app.company_name ?? "Empresa no especificada",
            status: normalizedStatus,
            created_at: app.created_at ?? "",
          };
        });

        setRows(mappedRows);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error inesperado cargando postulaciones."
        );
      }
    }

    loadApplications();

    return () => {
      isMounted = false;
    };
  }, []);

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
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        title="Aún no tienes postulaciones"
        description="Guarda o aplica a vacantes para empezar a ver tu tracking."
      />
    );
  } else {
    content = (
      <div className="ds-card overflow-x-auto rounded-lg">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-[#475569]">
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100 text-[#0F172A]">
                <td className="px-4 py-3 align-top">{row.title}</td>
                <td className="px-4 py-3 align-top">{row.company_name}</td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      STATUS_STYLES[row.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-[#475569]">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Postulaciones"
        description="Lleva el control de tus procesos y su estado."
        action={
          <Link href="/candidate/jobs">
            <Button variant="secondary">Volver a vacantes</Button>
          </Link>
        }
      />
      {content}
    </div>
  );
}

