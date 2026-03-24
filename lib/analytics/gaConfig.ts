/**
 * Server-safe GA4 config. Used by `app/layout.tsx` to decide whether to inject scripts.
 *
 * @see README — Google Analytics (GA4)
 */

const GA_ID_PATTERN = /^G-[A-Z0-9]+$/i;

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!raw || !GA_ID_PATTERN.test(raw)) return null;
  return raw;
}

/**
 * Load gtag in production when a valid ID is set.
 * In development, only when `NEXT_PUBLIC_GA_ENABLE_DEV=true`.
 */
export function shouldInjectGoogleAnalytics(): boolean {
  if (!getGaMeasurementId()) return false;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.NEXT_PUBLIC_GA_ENABLE_DEV === "true";
}
