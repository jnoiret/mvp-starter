/**
 * Alias for CV parsing — same handler as POST /api/candidate/parse-cv.
 * Onboarding uses /api/candidate/parse-cv; this path is for integrations / docs.
 */
export { POST } from "@/app/api/candidate/parse-cv/route";

export const runtime = "nodejs";
