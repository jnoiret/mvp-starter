/**
 * Admin dashboard access — simple email allowlist (no RBAC).
 */
export const ADMIN_EMAILS = [
  "joel.sales85@gmail.com",
  "noiretvg@gmail.com",
] as const;

const VALID_APP_ROLES = new Set(["candidate", "recruiter", "admin"]);

/** Roles admins may assign in `public.profiles.role`. */
export const MANAGEABLE_PROFILE_ROLES = [
  "candidate",
  "recruiter",
  "admin",
] as const;

export type ManageableProfileRole = (typeof MANAGEABLE_PROFILE_ROLES)[number];

export function isManageableProfileRole(
  value: string,
): value is ManageableProfileRole {
  return (MANAGEABLE_PROFILE_ROLES as readonly string[]).includes(value);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const n = normalizeEmail(email);
  return ADMIN_EMAILS.some((allowed) => normalizeEmail(allowed) === n);
}

/**
 * Role used for route access and navigation. Allowlisted emails always resolve to `admin`
 * so they can reach candidate/recruiter areas and the admin console (after DB sync).
 */
export function effectiveProfileRole(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): string | null {
  if (isAllowedAdminEmail(email)) return "admin";
  const r = typeof dbRole === "string" ? dbRole.trim() : "";
  if (!r || !VALID_APP_ROLES.has(r)) return null;
  return r;
}
