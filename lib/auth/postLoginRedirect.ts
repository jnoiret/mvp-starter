/**
 * Persist intended job / URL before magic-link login; consumed on `/auth/redirect`.
 */
export const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

export type PostLoginRedirectPayload = {
  type: "job";
  jobId: string;
  path: string;
};

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("..")) return false;
  return true;
}

/** Only allow redirects back into public job exploration. */
export function isSafeJobsPostLoginPath(path: string): boolean {
  if (!isSafeInternalPath(path)) return false;
  if (path === "/jobs") return true;
  if (path.startsWith("/jobs?")) return true;
  // /jobs/<id> (server redirects to ?job=)
  return /^\/jobs\/[^/?#]+\/?$/.test(path);
}

export function pathReferencesJobId(path: string, jobId: string): boolean {
  if (!jobId) return false;
  const q = path.indexOf("?");
  if (q >= 0) {
    const params = new URLSearchParams(path.slice(q + 1));
    return params.get("job") === jobId;
  }
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] === jobId;
}

export function parsePostLoginRedirectPayload(
  raw: string | null,
): PostLoginRedirectPayload | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (o.type !== "job") return null;
    if (typeof o.jobId !== "string" || !o.jobId.trim()) return null;
    if (typeof o.path !== "string" || !o.path.trim()) return null;
    return { type: "job", jobId: o.jobId.trim(), path: o.path.trim() };
  } catch {
    return null;
  }
}

export function clearPostLoginRedirect(): void {
  try {
    localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Save before opening the login modal. Uses current URL when already on `/jobs`;
 * otherwise defaults to `/jobs?job=…`.
 */
export function savePostLoginJobRedirect(jobId: string): void {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}`;
  const useCurrent =
    current.startsWith("/jobs") &&
    isSafeInternalPath(current) &&
    !current.includes("..") &&
    pathReferencesJobId(current, jobId);
  const path = useCurrent ? current : `/jobs?job=${encodeURIComponent(jobId)}`;

  const payload: PostLoginRedirectPayload = {
    type: "job",
    jobId,
    path,
  };
  try {
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
