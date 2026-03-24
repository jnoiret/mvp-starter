import type { OnboardingProfilePayload } from "@/lib/candidate/onboardingPayload";

export const ONBOARDING_DRAFT_STORAGE_KEY = "fichur:onboarding_draft:v1";

export type OnboardingDraftV1 = OnboardingProfilePayload & {
  v: 1;
  /** Where the user left off (for resume). */
  lastPhase: "preview" | "gate";
};

export function parseOnboardingDraft(raw: string | null): OnboardingDraftV1 | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const d = o as Record<string, unknown>;
    if (d.v !== 1) return null;
    if (d.lastPhase !== "preview" && d.lastPhase !== "gate") return null;
    return o as OnboardingDraftV1;
  } catch {
    return null;
  }
}

export function loadOnboardingDraft(): OnboardingDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    return parseOnboardingDraft(window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraftV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldApplyOnboardingDraft(
  profile: { role: string } | null | undefined,
  candidateProfileId: string | null | undefined,
): boolean {
  const role = profile?.role;
  if (role === "recruiter" || role === "admin") return false;
  const valid = new Set(["candidate", "recruiter", "admin"]);
  if (!role || !valid.has(role)) return true;
  if (role === "candidate" && !candidateProfileId) return true;
  return false;
}
