import type { ReactNode } from "react";

/**
 * Onboarding is reachable without auth (e.g. /onboarding).
 * Child routes that require a session enforce it in their own page.tsx.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">{children}</div>
  );
}
