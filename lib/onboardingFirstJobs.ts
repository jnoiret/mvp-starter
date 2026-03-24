/**
 * One-shot “first success” redirect after candidate onboarding completes.
 * Cleared when consumed so refresh lands on the main jobs experience.
 */
export const FIRST_JOBS_SESSION_KEY = "fichur:first_jobs_after_onboarding:v1";

export function markShowFirstJobsAfterOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FIRST_JOBS_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * True if this visit should show the first-jobs screen; clears the flag immediately
 * (a refresh without a new mark goes to the normal jobs list).
 */
export function takeFirstJobsLandingIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = sessionStorage.getItem(FIRST_JOBS_SESSION_KEY);
    if (v === "1") {
      sessionStorage.removeItem(FIRST_JOBS_SESSION_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
