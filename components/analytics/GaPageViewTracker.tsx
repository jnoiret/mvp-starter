"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

function GaPageViewTrackerInner({ gaId }: { gaId: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const isFirstPath = useRef(true);

  useEffect(() => {
    try {
      if (!gaId || typeof window === "undefined") return;
      if (isFirstPath.current) {
        isFirstPath.current = false;
        return;
      }
      const gtag = (window as Window & { gtag?: (...a: unknown[]) => void }).gtag;
      if (typeof gtag !== "function") return;
      const qs = searchParams?.toString();
      const pagePath = qs ? `${pathname}?${qs}` : pathname || "/";
      gtag("config", gaId, { page_path: pagePath });
    } catch {
      /* silent */
    }
  }, [gaId, pathname, searchParams]);

  return null;
}

/**
 * Sends GA4 virtual page views on App Router navigations (initial load handled by gtag config).
 */
export function GaPageViewTracker({ gaId }: { gaId: string }) {
  return (
    <Suspense fallback={null}>
      <GaPageViewTrackerInner gaId={gaId} />
    </Suspense>
  );
}
