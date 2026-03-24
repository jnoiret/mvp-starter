"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { GaPageViewTracker } from "./GaPageViewTracker";

type Props = {
  gaId: string;
  /** GA debug_mode — only when explicitly loading GA in development */
  debugMode?: boolean;
};

/**
 * GA4 via `@next/third-parties/google`, plus route-change page_path updates.
 * Render only when `shouldInjectGoogleAnalytics()` is true (see `lib/analytics/gaConfig.ts`).
 */
export function FichurGoogleAnalytics({ gaId, debugMode }: Props) {
  if (!gaId) return null;
  return (
    <>
      <GoogleAnalytics gaId={gaId} debugMode={debugMode} />
      <GaPageViewTracker gaId={gaId} />
    </>
  );
}
