/**
 * Central RBAC: roles, permissions, and resolution from session email + `profiles.role`.
 * Admin allowlist overrides DB role via `effectiveProfileRole` (allowlisted → admin).
 */

import { effectiveProfileRole } from "@/lib/admin/adminAllowlist";

export type AppRole = "candidate" | "recruiter" | "admin";

export type Permission =
  | "view_jobs"
  | "view_job_details"
  | "apply"
  | "view_own_applications"
  | "edit_own_profile"
  | "create_jobs"
  | "view_own_jobs"
  | "view_candidates"
  | "save_candidates"
  | "admin_full_access";

const CANDIDATE_PERMS = new Set<Permission>([
  "view_jobs",
  "view_job_details",
  "apply",
  "view_own_applications",
  "edit_own_profile",
]);

const RECRUITER_PERMS = new Set<Permission>([
  "create_jobs",
  "view_own_jobs",
  "view_candidates",
  "save_candidates",
]);

/**
 * Effective app role: allowlisted emails → `admin`; else valid `profiles.role`.
 */
export function resolveAppRole(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): AppRole | null {
  const r = effectiveProfileRole(email, dbRole);
  if (r === "candidate" || r === "recruiter" || r === "admin") return r;
  return null;
}

export function isAdmin(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): boolean {
  return resolveAppRole(email, dbRole) === "admin";
}

/** Recruiter capabilities (includes admins). */
export function isRecruiter(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): boolean {
  const r = resolveAppRole(email, dbRole);
  return r === "recruiter" || r === "admin";
}

/** Candidate capabilities (includes admins). */
export function isCandidate(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): boolean {
  const r = resolveAppRole(email, dbRole);
  return r === "candidate" || r === "admin";
}

export function roleSatisfiesPermission(
  role: AppRole,
  permission: Permission,
): boolean {
  if (role === "admin") return true;
  if (permission === "admin_full_access") return false;
  if (role === "candidate") {
    return CANDIDATE_PERMS.has(permission);
  }
  if (role === "recruiter") {
    return RECRUITER_PERMS.has(permission);
  }
  return false;
}

export function hasPermission(
  email: string | null | undefined,
  dbRole: string | null | undefined,
  permission: Permission,
): boolean {
  const role = resolveAppRole(email, dbRole);
  if (!role) return false;
  return roleSatisfiesPermission(role, permission);
}

/** Server layouts: `/candidate/*` */
export function canAccessCandidateRoutes(role: AppRole | null): boolean {
  return role === "candidate" || role === "admin";
}

/** Server layouts: `/recruiter/*` */
export function canAccessRecruiterRoutes(role: AppRole | null): boolean {
  return role === "recruiter" || role === "admin";
}

/**
 * APIs used during onboarding before role is set: any auth user except recruiter-only.
 * Allowlisted/admins always pass via `resolveAppRole` ≠ `recruiter` alone.
 */
export function canUseCandidateLifecycleApis(
  email: string | null | undefined,
  dbRole: string | null | undefined,
): boolean {
  return resolveAppRole(email, dbRole) !== "recruiter";
}
