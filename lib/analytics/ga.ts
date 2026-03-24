/**
 * Fichur GA4 custom events (client-side). Uses `window.gtag` from `@next/third-parties/google`.
 * All calls are no-ops if gtag is missing or throws — no console output.
 *
 * Import these only from Client Components or client-side code (event handlers, effects).
 *
 * @see README — Google Analytics (GA4)
 */

function gtagSafe(...args: unknown[]): void {
  try {
    if (typeof window === "undefined") return;
    const fn = (window as Window & { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof fn !== "function") return;
    fn(...args);
  } catch {
    /* intentionally silent — production must stay quiet */
  }
}

/** Low-level event; prefer the named helpers below. */
export function trackGaEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  if (!name) return;
  gtagSafe("event", name, params ?? {});
}

export function trackLoginMagicLinkRequested(
  params?: Record<string, unknown>,
): void {
  trackGaEvent("login_magic_link_requested", params);
}

export function trackOnboardingStarted(params?: Record<string, unknown>): void {
  trackGaEvent("onboarding_started", params);
}

export function trackCvUploaded(params?: Record<string, unknown>): void {
  trackGaEvent("cv_uploaded", params);
}

export function trackCvTextPasted(params?: Record<string, unknown>): void {
  trackGaEvent("cv_text_pasted", params);
}

export function trackProfileGenerated(params?: Record<string, unknown>): void {
  trackGaEvent("profile_generated", params);
}

export function trackOnboardingCompleted(
  params?: Record<string, unknown>,
): void {
  trackGaEvent("onboarding_completed", params);
}

export function trackJobViewed(params?: {
  job_id?: string;
  [key: string]: unknown;
}): void {
  trackGaEvent("job_viewed", params);
}

export function trackApplyClicked(params?: {
  job_id?: string;
  [key: string]: unknown;
}): void {
  trackGaEvent("apply_clicked", params);
}

export function trackRecruiterJobCreated(params?: Record<string, unknown>): void {
  trackGaEvent("recruiter_job_created", params);
}

export function trackRecruiterCandidateSaved(
  params?: Record<string, unknown>,
): void {
  trackGaEvent("recruiter_candidate_saved", params);
}
