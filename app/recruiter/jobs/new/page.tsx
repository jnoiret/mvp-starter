"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";

const SENIORITY = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "director", label: "Director" },
] as const;

export default function RecruiterNewJobPage() {
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [seniority, setSeniority] =
    useState<(typeof SENIORITY)[number]["value"]>("mid");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiter/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: jobTitle,
          company,
          description,
          seniority,
          industry,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.id) {
        setError(data.error ?? "No se pudo crear la vacante.");
        return;
      }
      router.push(`/recruiter/jobs/${data.id}/matches`);
    } catch {
      setError("Error de red al crear la vacante.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Nueva vacante"
        description="Completa los datos para publicar un puesto y ver candidatos."
      />
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Título del puesto
          </label>
          <input
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Empresa
          </label>
          <input
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Descripción
          </label>
          <textarea
            required
            rows={6}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Seniority
          </label>
          <select
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={seniority}
            onChange={(e) =>
              setSeniority(e.target.value as (typeof SENIORITY)[number]["value"])
            }
          >
            {SENIORITY.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Industria (opcional)
          </label>
          <input
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Creando…" : "Crear vacante y ver matches"}
        </Button>
      </form>
    </div>
  );
}
