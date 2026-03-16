import type { CandidateOnboardingData } from "./types";

const STORAGE_KEY = "fichur:candidate_onboarding:v1";

type PersistedData = Omit<CandidateOnboardingData, "cv_file"> & {
  cv_file: null;
};

export function loadOnboardingData(): Partial<PersistedData> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedData;
  } catch {
    return null;
  }
}

export function saveOnboardingData(data: CandidateOnboardingData) {
  if (typeof window === "undefined") return;
  const persisted: PersistedData = { ...data, cv_file: null };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

export function clearOnboardingData() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

