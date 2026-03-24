"use client";

import {
  buildProfessionalBlurb,
  deriveProfileGaps,
  deriveRecommendations,
  parseSkillTags,
  type FormLike,
} from "./intelligentProfileSummaryModel";

export type ProfileSummaryDensity = "full" | "light";

export type ProfileSummaryOrigin = "cv_file" | "pasted_text" | "manual";

type Props = {
  form: FormLike;
  density: ProfileSummaryDensity;
  /** Source of profile data — adjusts hero copy and back action. */
  profileOrigin?: ProfileSummaryOrigin;
  /** Weak parse / low extraction — show honest banner, lighter layout */
  qualityNotice: string | null;
  partialNotice: string | null;
  isPublic: boolean;
  onContinue: () => void;
  onEditProfile: () => void;
  onBackToCv: () => void;
  error: string | null;
};

function SectionCard({
  title,
  children,
  muted,
}: {
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border px-4 py-4 shadow-sm ${
        muted
          ? "border-zinc-100 bg-zinc-50/60"
          : "border-zinc-200/90 bg-white ring-1 ring-zinc-100"
      }`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function IntelligentProfileSummary({
  form,
  density,
  profileOrigin = "cv_file",
  qualityNotice,
  partialNotice,
  isPublic,
  onContinue,
  onEditProfile,
  onBackToCv,
  error,
}: Props) {
  const gaps = deriveProfileGaps(form);
  const recommendations = deriveRecommendations(gaps);
  const tags = parseSkillTags(form.skills);
  const summaryText = form.summary.trim();
  const blurb = buildProfessionalBlurb(form);

  const showFullResumen = density === "full" && (summaryText.length >= 20 || Boolean(blurb));
  const showLightResumen = density === "light" && (summaryText.length >= 12 || Boolean(blurb));
  const showResumenPlaceholder =
    !showFullResumen && !showLightResumen;

  const showSkillsSection =
    tags.length > 0 || (density === "light" && !tags.length) || (density === "full" && !tags.length);
  const showGaps = gaps.length > 0;
  const showRecs = recommendations.length > 0 && (density === "full" || (density === "light" && gaps.length > 0));

  const sourceLead =
    profileOrigin === "pasted_text"
      ? "Generamos este perfil con IA a partir del texto que pegaste. Revísalo y continúa, o edítalo si quieres ajustar algo."
      : profileOrigin === "manual"
        ? "Empezamos con un perfil base para que avances rápido. Revisa lo esencial y completa lo que falta antes de continuar."
        : "Generamos este perfil con IA a partir de tu CV. Revísalo y continúa, o edítalo si quieres ajustar algo.";

  const backLabel =
    profileOrigin === "pasted_text"
      ? "Volver a pegar texto"
      : profileOrigin === "manual"
        ? "Cambiar forma de entrada"
        : "Volver a subir CV";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[#0F172A]/60">
          Perfil inteligente
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
          Tu Perfil Inteligente
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600">
          {sourceLead}
          {density === "light" ? (
            <span className="mt-2 block text-zinc-500">
              La información detectada es limitada; conviene revisar y completar los datos.
            </span>
          ) : null}
        </p>
        {form.full_name.trim() ? (
          <p className="text-base font-medium text-zinc-800">{form.full_name.trim()}</p>
        ) : null}
      </header>

      {qualityNotice ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950">
          {qualityNotice}
        </div>
      ) : null}

      {partialNotice ? (
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 text-sm leading-relaxed text-slate-700">
          {partialNotice}
        </div>
      ) : null}

      <div className="space-y-4">
        {(showFullResumen || showLightResumen) && (
          <SectionCard title="Resumen profesional">
            {summaryText.length >= (density === "full" ? 20 : 12) ? (
              <p className="text-sm leading-relaxed text-zinc-700">{summaryText}</p>
            ) : blurb ? (
              <p className="text-sm leading-relaxed text-zinc-700">{blurb}</p>
            ) : null}
          </SectionCard>
        )}

        {showResumenPlaceholder && (
          <SectionCard title="Resumen profesional" muted>
            <p className="text-sm leading-relaxed text-zinc-600">
              {profileOrigin === "pasted_text"
                ? "Con el texto pegado aún no hay un párrafo de resumen con suficiente detalle. Podrás redactarlo al editar el perfil."
                : profileOrigin === "manual"
                  ? "Añade un breve resumen al editar el perfil para que las recomendaciones sean más precisas."
                  : "Con la información extraída del CV aún no hay un párrafo de resumen. Podrás redactarlo al editar el perfil."}
            </p>
          </SectionCard>
        )}

        {showSkillsSection && (
          <SectionCard title="Habilidades destacadas">
            {tags.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-lg border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">
                {profileOrigin === "pasted_text"
                  ? density === "full"
                    ? "No listamos habilidades con suficiente confianza a partir del texto. Revísalas al editar el perfil."
                    : "Aún no detectamos habilidades claras en el texto pegado. Podrás añadirlas al editar el perfil."
                  : profileOrigin === "manual"
                    ? "Añade tus habilidades clave al editar el perfil."
                    : density === "full"
                      ? "No listamos habilidades con suficiente confianza a partir del CV. Revísalas al editar el perfil."
                      : "Aún no detectamos habilidades claras en el CV. Podrás añadirlas al editar el perfil."}
              </p>
            )}
          </SectionCard>
        )}

        {density === "full" && showGaps && (
          <SectionCard title="Áreas a fortalecer" muted>
            <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </SectionCard>
        )}

        {density === "light" && showGaps && (
          <SectionCard title="Áreas a completar" muted>
            <p className="text-sm text-zinc-600">
              {gaps.slice(0, 4).join(" · ")}
              {gaps.length > 4 ? "…" : ""}
            </p>
          </SectionCard>
        )}

        {showRecs && (
          <SectionCard title="Recomendaciones">
            <ul className="space-y-2 text-sm leading-relaxed text-zinc-700">
              {recommendations.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F172A]/30" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {isPublic ? (
        <p className="text-xs leading-relaxed text-zinc-500">
          El correo lo pedimos en el siguiente paso solo para enviarte el enlace de acceso.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={onContinue}
          className="order-1 w-full rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900 sm:order-none sm:w-auto sm:min-w-[10rem]"
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={onEditProfile}
          className="order-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-[#334155] shadow-sm transition hover:bg-zinc-50 sm:order-none sm:w-auto sm:min-w-[10rem]"
        >
          Editar perfil
        </button>
        <button
          type="button"
          onClick={onBackToCv}
          className="order-3 text-center text-sm font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-[#0F172A] sm:order-none sm:ml-2 sm:no-underline"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}
