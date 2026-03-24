/** Shape needed for UI tiering (keeps `lib` free of `components` imports). */
export type MatchAnalysisForUi = {
  match_score?: number;
  summary?: string;
} | null;

export type ResponseProbabilityTier = "high" | "medium" | "low";

/**
 * Presentation-only tier from existing scores (logic unchanged: star 0–5 + optional AI 0–100).
 */
export function getResponseTierFromScores(
  starScore: number,
  aiScore: number | null | undefined,
): ResponseProbabilityTier {
  const useAi = typeof aiScore === "number" && aiScore > 0;
  if (useAi) {
    if (aiScore >= 70) return "high";
    if (aiScore >= 45) return "medium";
    return "low";
  }
  if (starScore >= 4) return "high";
  if (starScore === 3) return "medium";
  return "low";
}

export function responseProbabilityLabel(tier: ResponseProbabilityTier): string {
  if (tier === "high") return "Alta probabilidad de respuesta";
  if (tier === "medium") return "Probabilidad media";
  return "Baja probabilidad";
}

export function responseProbabilityBadgeClass(tier: ResponseProbabilityTier): string {
  if (tier === "high") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (tier === "medium") {
    return "border border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border border-rose-200 bg-rose-50 text-rose-900";
}

export function whyProbabilitySectionHeading(tier: ResponseProbabilityTier): string {
  if (tier === "high") return "Indicadores que respaldan tu postulación";
  return "Aspectos a tener en cuenta";
}

export function applyPrimaryCtaLabel(
  _tier: ResponseProbabilityTier,
  isApplied: boolean,
  loading: boolean,
): string {
  if (loading) return "Enviando...";
  if (isApplied) return "Postulado";
  return "Postularme a esta vacante";
}

/** CTA copy for list / job cards (decisión rápida). */
export function applyJobCardCtaLabel(isApplied: boolean, loading: boolean): string {
  if (loading) return "Enviando...";
  if (isApplied) return "Postulado";
  return "Postularme a esta vacante";
}

export function getProbabilityNarrativeSummary(starScore: number): string {
  if (starScore >= 4) {
    return "El resumen automático del listado marca varias señales a favor para esta vacante.";
  }
  if (starScore === 3) {
    return "El resumen automático del listado es mixto; conviene revisar el anuncio completo.";
  }
  return "El resumen automático del listado marca pocas señales a favor; el filtro puede ser exigente.";
}

/** Narrativa alineada al desglose por requisitos (rol, skills, experiencia). */
export function getBreakdownNarrativeSummary(tier: ResponseProbabilityTier): string {
  if (tier === "high") {
    return "Varios puntos del anuncio coinciden con los datos que comparamos de tu perfil.";
  }
  if (tier === "medium") {
    return "Hay coincidencias y diferencias frente al anuncio; revisar el detalle ayuda a decidir si aplica.";
  }
  return "Hay varias diferencias frente a lo publicado; aun así puede tener sentido postular si te interesa el rol.";
}

export function estimatedCompetenceFromStar(starScore: number): {
  level: string;
  hint: string;
} {
  if (starScore >= 4) {
    return {
      level: "Alto",
      hint: "Cobertura amplia en el modelo resumido del listado.",
    };
  }
  if (starScore >= 3) {
    return {
      level: "Medio",
      hint: "Señales mixtas en el modelo resumido del listado.",
    };
  }
  return {
    level: "Bajo",
    hint: "Pocas señales a favor en el modelo resumido del listado.",
  };
}

/** Texto bajo el badge cuando ya hay desglose por requisitos. */
export function alignmentSummaryFromTier(tier: ResponseProbabilityTier): {
  headline: string;
  subline: string;
} {
  if (tier === "high") {
    return {
      headline: "Comparación con el anuncio: amplia",
      subline:
        "Coincidencias claras en rol, habilidades y/o experiencia respecto a lo publicado.",
    };
  }
  if (tier === "medium") {
    return {
      headline: "Comparación con el anuncio: mixta",
      subline:
        "Parte de lo publicado encaja con tu perfil y parte no, en los criterios que comparamos.",
    };
  }
  return {
    headline: "Comparación con el anuncio: con diferencias",
    subline:
      "El anuncio pide cosas que no vimos alineadas en tu perfil en esos mismos criterios.",
  };
}

/** Una línea corta para cards: "Competencia estimada: Alta" */
export function competenciaEstimadaLine(starScore: number): string {
  const { level } = estimatedCompetenceFromStar(starScore);
  return `Competencia estimada: ${level}`;
}

const DEFAULT_AI_SUMMARY =
  "Señales resumidas que influyen en la probabilidad de respuesta para este rol.";

export function getProbabilityPresentation(
  analysis: MatchAnalysisForUi,
  starScore: number,
): {
  tier: ResponseProbabilityTier;
  label: string;
  badgeClass: string;
  summary: string;
} {
  const aiScore = analysis?.match_score;
  const tier = getResponseTierFromScores(starScore, aiScore);
  return {
    tier,
    label: responseProbabilityLabel(tier),
    badgeClass: responseProbabilityBadgeClass(tier),
    summary: analysis?.summary?.trim() || DEFAULT_AI_SUMMARY,
  };
}

/** Etiqueta y badge a partir del desglose honesto (rol, skills, experiencia). */
export function getProbabilityPresentationFromRequirementBreakdown(
  breakdownTier: ResponseProbabilityTier,
  analysis: MatchAnalysisForUi,
): {
  tier: ResponseProbabilityTier;
  label: string;
  badgeClass: string;
  summary: string;
} {
  return {
    tier: breakdownTier,
    label: responseProbabilityLabel(breakdownTier),
    badgeClass: responseProbabilityBadgeClass(breakdownTier),
    summary: analysis?.summary?.trim() || DEFAULT_AI_SUMMARY,
  };
}

/**
 * Recruiter lists often lack a local star score; use a neutral baseline when IA score is 0/unknown.
 */
export function getProbabilityPresentationFromAiOnly(aiScore: number) {
  const tier = getResponseTierFromScores(3, aiScore > 0 ? aiScore : undefined);
  return {
    tier,
    label: responseProbabilityLabel(tier),
    badgeClass: responseProbabilityBadgeClass(tier),
  };
}

type RecruiterAnalysisState = {
  status: "loading" | "success" | "error";
  data: { match_score: number } | null;
};

/** Recruiter job ↔ candidate cards: label + badge, sin porcentaje visible. */
export function recruiterAnalysisProbabilityBadge(analysis: RecruiterAnalysisState): {
  label: string;
  badgeClass: string;
} {
  if (analysis.status === "loading") {
    return {
      label: "Analizando…",
      badgeClass: "border border-slate-200 bg-slate-100 text-slate-800",
    };
  }
  if (analysis.status === "error" || !analysis.data) {
    return {
      label: "Probabilidad por revisar",
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-950",
    };
  }
  const { label, badgeClass } = getProbabilityPresentationFromAiOnly(analysis.data.match_score);
  return { label, badgeClass };
}
