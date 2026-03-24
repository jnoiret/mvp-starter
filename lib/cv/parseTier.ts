import {
  analyzeCoreProfileFields,
  coreFieldsHaveGap,
  type CoreFieldAnalysis,
} from "@/lib/cv/coreProfileFieldState";
import type { CvParseFeedback } from "@/lib/cv/parseDiagnostics";
import type { ProfileSignalFields } from "@/lib/cv/parseDiagnostics";

/**
 * UX tier after extraction + normalization (no raw AI output).
 */
export type ParseTier = "extraction_failed" | "weak" | "partial" | "strong";

export type ParsedProfileLike = ProfileSignalFields;

export function computeParseTier(args: {
  parse_feedback: CvParseFeedback;
  meaningfulFieldCount: number;
  data: ParsedProfileLike;
}): ParseTier {
  if (args.parse_feedback === "no_selectable_text") {
    return "extraction_failed";
  }

  if (args.meaningfulFieldCount < 3) {
    return "weak";
  }

  const core = analyzeCoreProfileFields({
    target_role: args.data.target_role,
    current_title: args.data.current_title,
    summary: args.data.summary,
    skills: args.data.skills,
    tools: args.data.tools,
    years_experience: args.data.years_experience,
  });

  const gap = coreFieldsHaveGap(core);

  if (gap) {
    return "partial";
  }

  if (args.parse_feedback === "ok" && args.meaningfulFieldCount >= 4) {
    return "strong";
  }

  return "partial";
}

export function describeCoreFieldsForClient(
  data: ParsedProfileLike,
): CoreFieldAnalysis[] {
  return analyzeCoreProfileFields({
    target_role: data.target_role,
    current_title: data.current_title,
    summary: data.summary,
    skills: data.skills,
    tools: data.tools,
    years_experience: data.years_experience,
  });
}
