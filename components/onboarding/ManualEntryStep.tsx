"use client";

import type { WorkMode } from "@/components/candidate/onboarding/types";
import type { AiReviewForm } from "./AiFirstProfileReview";

const WORK_OPTIONS: { value: WorkMode; label: string }[] = [
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
  { value: "indiferente", label: "Indiferente" },
];

type Variant = "public" | "authenticated";

/** Last-resort manual path: minimal guided fields before AI-style review. */
export function ManualEntryStep({
  form,
  setForm,
  error,
  variant,
  onBack,
  onContinue,
}: {
  form: AiReviewForm;
  setForm: React.Dispatch<React.SetStateAction<AiReviewForm>>;
  error: string | null;
  variant: Variant;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-xs leading-relaxed text-zinc-600">
        <span className="font-medium text-zinc-800">Entrada manual:</span> solo lo esencial. En el
        siguiente paso verás tu perfil por secciones y podrás afinar rol, resumen y habilidades.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nombre completo</label>
          <input
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Rol objetivo</label>
          <input
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            placeholder="Ej. Frontend Developer, UX Researcher…"
            value={form.target_role}
            onChange={(e) => setForm((p) => ({ ...p, target_role: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Habilidades (coma)</label>
          <textarea
            rows={2}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            placeholder="Ej. React, SQL, liderazgo…"
            value={form.skills}
            onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Años de experiencia</label>
          <input
            inputMode="numeric"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            value={form.years_experience}
            onChange={(e) => setForm((p) => ({ ...p, years_experience: e.target.value }))}
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
          <label className="mb-1 block text-xs font-medium text-zinc-600">WhatsApp / teléfono</label>
          <input
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            value={form.whatsapp}
            onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Expectativa salarial</label>
          <input
            inputMode="numeric"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            value={form.expected_salary}
            onChange={(e) => setForm((p) => ({ ...p, expected_salary: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
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
        {variant === "authenticated" ? (
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900"
        >
          Continuar al perfil
        </button>
      </div>
    </div>
  );
}
