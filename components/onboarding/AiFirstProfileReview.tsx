"use client";

import { useMemo } from "react";
import {
  analyzeCoreProfileFields,
  type CoreFieldKey,
  type CoreFieldState,
} from "@/lib/cv/coreProfileFieldState";
import { computeParseTier } from "@/lib/cv/parseTier";
import type { ParseTier } from "@/lib/cv/parseTier";
import {
  countMeaningfulProfileSignals,
  type CvParseFeedback,
  type ProfileSignalFields,
} from "@/lib/cv/parseDiagnostics";
import type { WorkMode } from "@/components/candidate/onboarding/types";

const WORK_OPTIONS: { value: WorkMode; label: string }[] = [
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
  { value: "indiferente", label: "Indiferente" },
];

const SECTION_TITLE: Record<CoreFieldKey, string> = {
  target_role: "Rol objetivo",
  summary: "Resumen profesional",
  skills: "Habilidades",
  years_experience: "Años de experiencia",
};

function sectionShellClass(state: CoreFieldState): string {
  if (state === "complete") {
    return "border-emerald-200/80 bg-emerald-50/25";
  }
  if (state === "partial") {
    return "border-amber-200/90 bg-amber-50/20";
  }
  return "border-rose-200/90 bg-rose-50/25";
}

function tierHint(tier: ParseTier): string {
  if (tier === "strong") return "Perfil generado con buena cobertura. Revisa y continúa.";
  if (tier === "partial") return "Completamos parte de tu perfil. Completa lo resaltado abajo.";
  return "Ajusta los campos clave para mejorar tu encaje con vacantes.";
}

export type AiReviewForm = {
  full_name: string;
  email: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: string;
  skills: string;
  summary: string;
  expected_salary: string;
  work_mode: WorkMode | "";
};

type Props = {
  form: AiReviewForm;
  setForm: React.Dispatch<React.SetStateAction<AiReviewForm>>;
  isPublic: boolean;
  error: string | null;
  onContinue: () => void;
  onBack: () => void;
  cvEntryMode: "file" | "paste" | "none";
};

function formToSignalFields(f: AiReviewForm): ProfileSignalFields {
  return {
    full_name: f.full_name,
    email: f.email.trim(),
    phone: "",
    whatsapp: f.whatsapp,
    city: f.city,
    location: f.city,
    current_title: f.target_role,
    target_role: f.target_role,
    years_experience: f.years_experience,
    skills: f.skills,
    tools: "",
    expected_salary: f.expected_salary,
    summary: f.summary,
  };
}

export function AiFirstProfileReview({
  form,
  setForm,
  isPublic,
  error,
  onContinue,
  onBack,
  cvEntryMode,
}: Props) {
  const analysis = useMemo(
    () =>
      analyzeCoreProfileFields({
        target_role: form.target_role,
        current_title: form.target_role,
        summary: form.summary,
        skills: form.skills,
        tools: "",
        years_experience: form.years_experience,
      }),
    [form.target_role, form.summary, form.skills, form.years_experience],
  );

  const liveTier = useMemo(() => {
    const meaningful = countMeaningfulProfileSignals(formToSignalFields(form));
    const feedback: CvParseFeedback = meaningful < 3 ? "weak_profile_data" : "ok";
    return computeParseTier({
      parse_feedback: feedback,
      meaningfulFieldCount: meaningful,
      data: formToSignalFields(form),
    });
  }, [form]);

  const backLabel =
    cvEntryMode === "paste"
      ? "Volver a pegar texto"
      : cvEntryMode === "file"
        ? "Volver a subir CV"
        : "Cambiar forma de entrada";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[#0F172A]/55">
          Perfil con IA
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
          Revisa tu perfil
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600">{tierHint(liveTier)}</p>
      </header>

      <div className="space-y-4">
        {analysis.map((field) => (
          <section
            key={field.key}
            className={`rounded-2xl border px-4 py-4 shadow-sm ring-1 ring-black/[0.03] ${sectionShellClass(field.state)}`}
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-sm font-semibold text-[#0F172A]">{SECTION_TITLE[field.key]}</h3>
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {field.state === "complete"
                  ? "Completo"
                  : field.state === "partial"
                    ? "Parcial"
                    : "Falta"}
              </span>
            </div>
            {field.guidance ? (
              <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-700">{field.guidance}</p>
            ) : null}

            <div className="mt-3">
              {field.key === "target_role" ? (
                <input
                  className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  value={form.target_role}
                  onChange={(e) => setForm((p) => ({ ...p, target_role: e.target.value }))}
                  placeholder="Ej. Product Designer, Data Analyst…"
                />
              ) : null}
              {field.key === "summary" ? (
                <textarea
                  rows={5}
                  className="w-full resize-y rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  value={form.summary}
                  onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                  placeholder="2–4 frases sobre tu trayectoria y foco profesional"
                />
              ) : null}
              {field.key === "skills" ? (
                <textarea
                  rows={3}
                  className="w-full resize-y rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  value={form.skills}
                  onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
                  placeholder="Separadas por coma: TypeScript, Figma, SQL…"
                />
              ) : null}
              {field.key === "years_experience" ? (
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  value={form.years_experience}
                  onChange={(e) => setForm((p) => ({ ...p, years_experience: e.target.value }))}
                />
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-zinc-100">
        <h3 className="text-sm font-semibold text-[#0F172A]">Contacto y expectativas</h3>
        <p className="mt-1 text-xs text-zinc-500">Confirma estos datos para que las vacantes encajen contigo.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Nombre completo</label>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">WhatsApp / teléfono</label>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              value={form.whatsapp}
              onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Ciudad</label>
            <input
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Expectativa salarial (mensual)</label>
            <input
              inputMode="numeric"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              value={form.expected_salary}
              onChange={(e) => setForm((p) => ({ ...p, expected_salary: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Modalidad</label>
            <select
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              value={form.work_mode}
              onChange={(e) =>
                setForm((p) => ({ ...p, work_mode: e.target.value as WorkMode | "" }))
              }
            >
              <option value="" disabled>
                Selecciona
              </option>
              {WORK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {!isPublic ? (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Correo</label>
              <input
                type="email"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {isPublic ? (
        <p className="text-xs text-zinc-500">
          El correo lo pedimos en el siguiente paso solo para enviarte el enlace de acceso.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900"
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}
