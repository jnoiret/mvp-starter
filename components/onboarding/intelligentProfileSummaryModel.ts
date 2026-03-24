/** Derive summary UI from form state only — no hallucinated content. */

export type FormLike = {
  full_name: string;
  whatsapp: string;
  city: string;
  target_role: string;
  years_experience: string;
  skills: string;
  summary: string;
  expected_salary: string;
  work_mode: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeMoney(value: string) {
  return value.replace(/\D/g, "");
}

export function isPlaceholderCity(city: string) {
  return !city.trim() || city.trim() === "Por definir";
}

export function isPlaceholderRole(role: string) {
  return !role.trim() || role.trim() === "Por definir";
}

export function isPlaceholderSkills(skills: string) {
  return !skills.trim() || skills.includes("Por completar");
}

export function isWeakWhatsapp(whatsapp: string) {
  const d = onlyDigits(whatsapp);
  return d.length < 8 || d === "0000000000";
}

export function parseSkillTags(skills: string): string[] {
  return skills
    .split(/[,;•·]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/por completar/i.test(t))
    .slice(0, 16);
}

/** Observable gaps only — used for "Áreas a fortalecer" + recommendations. */
export function deriveProfileGaps(form: FormLike): string[] {
  const gaps: string[] = [];
  if (isWeakWhatsapp(form.whatsapp)) gaps.push("Contacto (WhatsApp o teléfono)");
  if (isPlaceholderCity(form.city)) gaps.push("Ciudad o región");
  if (isPlaceholderRole(form.target_role)) gaps.push("Rol u objetivo profesional");
  if (isPlaceholderSkills(form.skills)) gaps.push("Habilidades concretas");
  const y = Number(onlyDigits(form.years_experience));
  if (!Number.isFinite(y) || y <= 0) gaps.push("Años de experiencia");
  const summary = form.summary.trim();
  if (summary.length < 20) gaps.push("Resumen profesional breve");
  const sal = Number(normalizeMoney(form.expected_salary));
  if (!Number.isFinite(sal) || sal <= 1) gaps.push("Expectativa salarial");
  if (!form.work_mode) gaps.push("Modalidad de trabajo");
  return gaps;
}

/** One recommendation per gap type — factual, not invented. */
export function deriveRecommendations(gaps: string[]): string[] {
  const recs: string[] = [];
  for (const g of gaps) {
    if (g.includes("Contacto"))
      recs.push(
        "Añade un número de contacto válido para que las empresas puedan escribirte por WhatsApp.",
      );
    else if (g.includes("Ciudad"))
      recs.push("Indica tu ciudad o región para encajar mejor con ofertas locales o híbridas.");
    else if (g.includes("Rol"))
      recs.push("Define el rol que buscas para que podamos mostrarte vacantes más alineadas.");
    else if (g.includes("Habilidades"))
      recs.push("Lista 3–6 habilidades clave separadas por coma (stack, idiomas, metodologías).");
    else if (g.includes("Años"))
      recs.push("Indica tus años de experiencia aproximados en tu área.");
    else if (g.includes("Resumen"))
      recs.push("Un párrafo corto sobre tu trayectoria ayuda a contextualizar tu perfil.");
    else if (g.includes("salarial"))
      recs.push("Una expectativa salarial orientativa mejora el emparejamiento con ofertas.");
    else if (g.includes("Modalidad"))
      recs.push("Elige si prefieres remoto, presencial u híbrido.");
    if (recs.length >= 4) break;
  }
  return recs.slice(0, 4);
}

/** Fallback line when there is no AI summary text — built only from parsed fields. */
export function buildProfessionalBlurb(form: FormLike): string | null {
  const parts: string[] = [];
  if (!isPlaceholderRole(form.target_role)) parts.push(form.target_role.trim());
  const y = Number(onlyDigits(form.years_experience));
  if (Number.isFinite(y) && y > 0) {
    parts.push(`${y} año${y === 1 ? "" : "s"} de experiencia`);
  }
  if (!isPlaceholderCity(form.city)) parts.push(`ubicación: ${form.city.trim()}`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
