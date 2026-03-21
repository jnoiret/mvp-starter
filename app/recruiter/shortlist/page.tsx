"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  getJobMatchAnalysis,
  type MatchAnalysis,
} from "@/components/jobs/jobMatchAnalysisClient";

type ShortlistStatus = "saved" | "reviewing" | "interview" | "rejected";
type PageStatus = "loading" | "success" | "error";
type TabFilter = "all" | ShortlistStatus;

type ShortlistItem = {
  candidate_id: string;
  job_id: string;
  notes: string;
  status: ShortlistStatus;
  candidate: {
    id: string;
    full_name: string | null;
    email: string | null;
    target_role: string | null;
    city: string | null;
    work_mode: string | null;
    years_experience: number | null;
    skills: string | null;
  } | null;
  job: {
    id: string;
    job_title: string | null;
    company: string | null;
    description: string | null;
    seniority: string | null;
    industry: string | null;
  } | null;
};

type AnalysisState = {
  status: "loading" | "success" | "error";
  data: MatchAnalysis | null;
};

type DraftState = {
  notes: string;
  status: ShortlistStatus;
};

const STATUS_ORDER: ShortlistStatus[] = [
  "saved",
  "reviewing",
  "interview",
  "rejected",
];

const STATUS_LABELS: Record<ShortlistStatus, string> = {
  saved: "Guardado",
  reviewing: "En revisión",
  interview: "Entrevista",
  rejected: "Rechazado",
};

const STATUS_BADGE_CLASS: Record<ShortlistStatus, string> = {
  saved:
    "border border-zinc-200 bg-zinc-50 text-zinc-700",
  reviewing:
    "border border-amber-200 bg-amber-50 text-amber-900",
  interview:
    "border border-emerald-200 bg-emerald-50 text-emerald-900",
  rejected:
    "border border-rose-200 bg-rose-50 text-rose-900",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function rowKey(item: Pick<ShortlistItem, "candidate_id" | "job_id">) {
  return `${item.candidate_id}:${item.job_id}`;
}

function toCandidateName(item: ShortlistItem) {
  const fullName = normalizeText(item.candidate?.full_name);
  if (fullName) return fullName;
  const email = normalizeText(item.candidate?.email);
  if (email) return email;
  return "Candidato sin nombre";
}

function toCandidateFullNameDisplay(item: ShortlistItem) {
  const fullName = normalizeText(item.candidate?.full_name);
  if (fullName) return fullName;
  return "—";
}

function toJobTitle(item: ShortlistItem) {
  return normalizeText(item.job?.job_title) || "Vacante sin título";
}

function formatWorkLocation(city: string | null, workMode: string | null) {
  const c = normalizeText(city);
  const w = normalizeText(workMode);
  if (c && w) return `${c} · ${w}`;
  if (c) return c;
  if (w) return w;
  return "—";
}

function formatYears(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value} años`;
}

function deriveCandidateSummary(
  candidate: NonNullable<ShortlistItem["candidate"]>
) {
  const targetRole = normalizeText(candidate.target_role);
  const years =
    typeof candidate.years_experience === "number" &&
    Number.isFinite(candidate.years_experience)
      ? `${candidate.years_experience} años`
      : "";
  const firstSkills = normalizeText(candidate.skills)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const parts = [
    targetRole ? `Rol objetivo: ${targetRole}.` : "",
    years ? `Experiencia: ${years}.` : "",
    firstSkills ? `Skills clave: ${firstSkills}.` : "",
  ].filter(Boolean);

  return parts.join(" ").trim() || "Perfil sin resumen estructurado.";
}

function toCandidatePayload(candidate: NonNullable<ShortlistItem["candidate"]>) {
  return {
    summary: deriveCandidateSummary(candidate),
    skills: normalizeText(candidate.skills),
    tools: "",
    industries: "",
    seniority: "",
    years_experience:
      typeof candidate.years_experience === "number" &&
      Number.isFinite(candidate.years_experience)
        ? candidate.years_experience
        : 0,
  };
}

function toJobPayload(job: NonNullable<ShortlistItem["job"]>) {
  return {
    title: normalizeText(job.job_title),
    company: normalizeText(job.company),
    description: normalizeText(job.description),
    requirements: normalizeText(job.description),
    industry: normalizeText(job.industry),
  };
}

function getMatchLabel(analysis: AnalysisState) {
  if (analysis.status === "loading") return "Analizando…";
  if (analysis.status === "error" || !analysis.data) return "Compatibilidad por revisar";
  if (analysis.data.match_score > 0) return `${analysis.data.match_score}% match`;
  return "Match inicial";
}

export default function RecruiterShortlistPage() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [analysisByKey, setAnalysisByKey] = useState<Record<string, AnalysisState>>({});
  const [draftsByKey, setDraftsByKey] = useState<Record<string, DraftState>>({});
  const [savingByKey, setSavingByKey] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<TabFilter>("all");
  const [notesOpenByKey, setNotesOpenByKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function loadShortlist() {
      setStatus("loading");
      setErrorMessage(null);
      try {
        const response = await fetch("/api/recruiter/shortlist", { method: "GET" });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          items?: ShortlistItem[];
        };

        if (!mounted) return;

        if (!response.ok || !payload.success) {
          setStatus("error");
          setErrorMessage(payload.error ?? "No pudimos cargar el shortlist.");
          return;
        }

        const nextItems = payload.items ?? [];
        setItems(nextItems);
        setDraftsByKey(
          Object.fromEntries(
            nextItems.map((item) => [
              rowKey(item),
              {
                notes: item.notes ?? "",
                status: (item.status ?? "saved") as ShortlistStatus,
              } satisfies DraftState,
            ])
          )
        );
        setAnalysisByKey(
          Object.fromEntries(
            nextItems.map((item) => [
              rowKey(item),
              {
                status: "loading",
                data: null,
              } satisfies AnalysisState,
            ])
          )
        );
        setStatus("success");
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      }
    }

    void loadShortlist();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;

    const run = async () => {
      const queue = [...items];
      const concurrency = 4;

      const worker = async () => {
        while (!cancelled && queue.length > 0) {
          const item = queue.shift();
          if (!item) return;
          const key = rowKey(item);
          if (!item.candidate || !item.job) {
            if (cancelled) return;
            setAnalysisByKey((prev) => ({
              ...prev,
              [key]: { status: "error", data: null },
            }));
            continue;
          }

          try {
            const analysis = await getJobMatchAnalysis({
              candidate_profile: toCandidatePayload(item.candidate),
              job_listing: toJobPayload(item.job),
            });
            if (cancelled) return;
            setAnalysisByKey((prev) => ({
              ...prev,
              [key]: { status: "success", data: analysis },
            }));
          } catch {
            if (cancelled) return;
            setAnalysisByKey((prev) => ({
              ...prev,
              [key]: { status: "error", data: null },
            }));
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const rankedItems = useMemo(() => {
    const enriched = items.map((item, index) => {
      const key = rowKey(item);
      const analysis = analysisByKey[key] ?? { status: "loading", data: null };
      const score = analysis.data?.match_score ?? -1;
      return { item, index, key, analysis, score };
    });
    enriched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    return enriched;
  }, [items, analysisByKey]);

  const countsByStatus = useMemo(() => {
    const base: Record<ShortlistStatus, number> = {
      saved: 0,
      reviewing: 0,
      interview: 0,
      rejected: 0,
    };
    for (const item of items) {
      const s = item.status as ShortlistStatus;
      if (s in base) base[s] += 1;
    }
    return base;
  }, [items]);

  const visibleRanked = useMemo(() => {
    if (tab === "all") return rankedItems;
    return rankedItems.filter(({ item }) => item.status === tab);
  }, [rankedItems, tab]);

  function updateDraft(
    key: string,
    updates: Partial<{
      notes: string;
      status: ShortlistStatus;
    }>
  ) {
    setDraftsByKey((prev) => ({
      ...prev,
      [key]: {
        notes: updates.notes ?? prev[key]?.notes ?? "",
        status: updates.status ?? prev[key]?.status ?? "saved",
      },
    }));
  }

  const persistRow = useCallback(
    async (
      item: ShortlistItem,
      draft: DraftState,
      options?: { revertDraftOnFailure?: boolean }
    ) => {
      const key = rowKey(item);
      const revertDraftOnFailure = options?.revertDraftOnFailure !== false;
      const previous: DraftState = {
        notes: item.notes ?? "",
        status: item.status,
      };
      setSavingByKey((prev) => ({ ...prev, [key]: true }));
      try {
        const response = await fetch("/api/recruiter/shortlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_id: item.candidate_id,
            job_id: item.job_id,
            notes: draft.notes,
            status: draft.status,
          }),
        });
        const payload = (await response.json()) as { success?: boolean; error?: string };
        if (!response.ok || !payload.success) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[recruiter/shortlist] save failed", payload);
          }
          if (revertDraftOnFailure) {
            setDraftsByKey((prev) => ({ ...prev, [key]: previous }));
          }
          return;
        }

        setItems((prev) =>
          prev.map((current) =>
            rowKey(current) === key
              ? { ...current, notes: draft.notes, status: draft.status }
              : current
          )
        );
      } finally {
        setSavingByKey((prev) => ({ ...prev, [key]: false }));
      }
    },
    []
  );

  async function saveNotesOnly(item: ShortlistItem) {
    const key = rowKey(item);
    const draft = draftsByKey[key];
    if (!draft) return;
    await persistRow(item, draft, { revertDraftOnFailure: false });
  }

  function handleStatusChange(item: ShortlistItem, key: string, nextStatus: ShortlistStatus) {
    const prevDraft =
      draftsByKey[key] ?? {
        notes: item.notes ?? "",
        status: item.status,
      };
    const nextDraft = { ...prevDraft, status: nextStatus };
    setDraftsByKey((prev) => ({ ...prev, [key]: nextDraft }));
    void persistRow(item, nextDraft);
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 md:px-8 py-8">
        <LoadingState />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 md:px-8 py-8">
        <EmptyState
          title="No pudimos cargar tu shortlist"
          description={errorMessage ?? "Ocurrió un error inesperado."}
        />
      </div>
    );
  }

  if (rankedItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 md:px-8 pb-12">
        <div className="flex flex-col gap-8">
          <PageHeader
            title="Pipeline de shortlist"
            description="Aquí verás candidatos que guardes desde las coincidencias de cada vacante."
          />
          <EmptyState
            title="Aún no tienes candidatos en el pipeline"
            description="Abre una vacante, ve a la vista de matches y usa «Guardar candidato» para añadirlo a tu shortlist. Podrás moverlo por etapas y tomar notas desde aquí."
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/recruiter/jobs/new"
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3B4EFF]",
                    "ds-accent-gradient text-white shadow-sm hover:brightness-95 active:brightness-90"
                  )}
                >
                  Crear una vacante
                </Link>
                <p className="max-w-xs text-left text-xs text-[#64748B] sm:text-center">
                  Si ya tienes vacantes, entra al detalle de una y abre <strong>Matches</strong> para guardar perfiles.
                </p>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8 pb-12">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Pipeline de shortlist"
          description="Organiza candidatos por etapa, toma notas y abre perfiles o vacantes en un clic."
        />

        <div
          className="flex flex-wrap gap-2 border-b border-zinc-200 pb-4"
          role="tablist"
          aria-label="Filtrar por estado"
        >
          <TabButton
            active={tab === "all"}
            onClick={() => setTab("all")}
            label="Todos"
            count={items.length}
          />
          {STATUS_ORDER.map((s) => (
            <TabButton
              key={s}
              active={tab === s}
              onClick={() => setTab(s)}
              label={STATUS_LABELS[s]}
              count={countsByStatus[s]}
            />
          ))}
        </div>

        {visibleRanked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-600">
            No hay candidatos en esta etapa. Cambia de pestaña o mueve candidatos desde otra vista.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {visibleRanked.map(({ item, key, analysis }) => {
              const draft =
                draftsByKey[key] ?? { notes: "", status: "saved" as ShortlistStatus };
              const isSaving = savingByKey[key] === true;
              const notesOpen = notesOpenByKey[key] === true;
              const hasNotes = normalizeText(draft.notes).length > 0;

              const profileHref = `/recruiter/candidates/${item.candidate_id}?job_id=${encodeURIComponent(item.job_id)}`;
              const jobHref = `/recruiter/jobs/${item.job_id}`;

              return (
                <li
                  key={key}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[draft.status]}`}
                        >
                          {STATUS_LABELS[draft.status]}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Candidato
                        </p>
                        <h2 className="text-lg font-semibold text-[#0F172A]">
                          {toCandidateName(item)}
                        </h2>
                        {item.candidate?.email ? (
                          <p className="text-sm text-[#64748B]">{item.candidate.email}</p>
                        ) : null}
                      </div>

                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Nombre completo
                          </dt>
                          <dd className="text-[#334155]">{toCandidateFullNameDisplay(item)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Match con la vacante
                          </dt>
                          <dd className="font-medium text-[#334155]">{getMatchLabel(analysis)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Rol objetivo
                          </dt>
                          <dd className="text-[#334155]">
                            {normalizeText(item.candidate?.target_role) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Ubicación / modalidad
                          </dt>
                          <dd className="text-[#334155]">
                            {formatWorkLocation(
                              item.candidate?.city ?? null,
                              item.candidate?.work_mode ?? null
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Experiencia
                          </dt>
                          <dd className="text-[#334155]">
                            {formatYears(item.candidate?.years_experience ?? null)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Vacante
                          </dt>
                          <dd className="text-[#334155]">
                            <span className="font-medium">{toJobTitle(item)}</span>
                            {item.job?.company ? (
                              <span className="text-zinc-600"> · {item.job.company}</span>
                            ) : null}
                          </dd>
                        </div>
                      </dl>

                      <div className="rounded-xl bg-zinc-50/90 px-3 py-2">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-[#334155]"
                          onClick={() =>
                            setNotesOpenByKey((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          aria-expanded={notesOpen}
                        >
                          <span>
                            Notas del reclutador
                            {!notesOpen && hasNotes ? (
                              <span className="ml-2 font-normal text-zinc-500">
                                (hay notas guardadas)
                              </span>
                            ) : null}
                          </span>
                          <span className="text-zinc-400">{notesOpen ? "▲" : "▼"}</span>
                        </button>
                        {notesOpen ? (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={draft.notes}
                              onChange={(e) => updateDraft(key, { notes: e.target.value })}
                              placeholder="Contexto de la conversación, próximos pasos, feedback…"
                              rows={4}
                              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#3B4EFF] focus:ring-2 focus:ring-[#3B4EFF]/20"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void saveNotesOnly(item)}
                              disabled={isSaving}
                            >
                              {isSaving ? "Guardando…" : "Guardar notas"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-3 border-t border-zinc-100 pt-4 lg:w-56 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Mover a etapa
                      </label>
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          handleStatusChange(
                            item,
                            key,
                            e.target.value as ShortlistStatus
                          )
                        }
                        disabled={isSaving}
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#3B4EFF] focus:ring-2 focus:ring-[#3B4EFF]/20 disabled:opacity-60"
                      >
                        <option value="saved">{STATUS_LABELS.saved}</option>
                        <option value="reviewing">{STATUS_LABELS.reviewing}</option>
                        <option value="interview">{STATUS_LABELS.interview}</option>
                        <option value="rejected">{STATUS_LABELS.rejected}</option>
                      </select>

                      <div className="flex flex-col gap-2">
                        <Link
                          href={profileHref}
                          className={cn(
                            "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3B4EFF]",
                            "ds-accent-gradient text-white shadow-sm hover:brightness-95 active:brightness-90"
                          )}
                        >
                          Ver perfil
                        </Link>
                        <Link
                          href={jobHref}
                          className={cn(
                            "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3B4EFF]",
                            "border border-[#CBD5E1] bg-white text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
                          )}
                        >
                          Ver vacante
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  const { active, onClick, label, count } = props;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-[#3B4EFF] text-white shadow-sm"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? "bg-white/20 text-white" : "bg-white text-zinc-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
