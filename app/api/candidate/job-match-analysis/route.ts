import { NextResponse } from "next/server";
import { requireCandidateFeatureApi } from "@/lib/auth/apiRbac";
import {
  generateJobMatchAnalysis,
  type MatchCandidateProfile,
  type MatchJobListing,
} from "@/lib/candidate/job-match-analysis";

export const runtime = "nodejs";

type RequestPayload = {
  candidate_profile?: Partial<MatchCandidateProfile>;
  job_listing?: Partial<MatchJobListing>;
};

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string").join(", ");
  }
  return "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function POST(request: Request) {
  try {
    const auth = await requireCandidateFeatureApi();
    if (auth instanceof NextResponse) return auth;

    const payload = (await request.json()) as RequestPayload;
    const rawCandidate = payload.candidate_profile ?? {};
    const rawJob = payload.job_listing ?? {};

    const candidate_profile: MatchCandidateProfile = {
      summary: asString(rawCandidate.summary),
      skills: asString(rawCandidate.skills),
      tools: asString(rawCandidate.tools),
      industries: asString(rawCandidate.industries),
      seniority: asString(rawCandidate.seniority),
      years_experience: asNumber(rawCandidate.years_experience),
    };

    const job_listing: MatchJobListing = {
      title: asString(rawJob.title),
      company: asString(rawJob.company),
      description: asString(rawJob.description),
      requirements: asString(rawJob.requirements),
      industry: asString(rawJob.industry),
    };

    const analysis = await generateJobMatchAnalysis(candidate_profile, job_listing);
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "No pudimos analizar la compatibilidad en este momento.",
        reason,
      },
      { status: 500 }
    );
  }
}
