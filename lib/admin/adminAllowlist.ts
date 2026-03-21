/**
 * Admin dashboard access — simple email allowlist (no RBAC).
 */
export const ADMIN_EMAILS = [
  "joel.sales85@gmail.com",
  "noiretvg@gmail.com",
] as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const n = normalizeEmail(email);
  return ADMIN_EMAILS.some((allowed) => normalizeEmail(allowed) === n);
}
