/**
 * Human-friendly labels for the site header (no raw email in the trigger).
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";

type ProfilesRow = { role: string; email: string | null };

function fullNameFromUserMetadata(user: User): string | null {
  const meta = user.user_metadata as { full_name?: string } | undefined;
  const v = meta?.full_name;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Loads email/role from `profiles` plus best-effort `full_name`:
 * candidate → `candidate_profiles`; recruiter → auth metadata; admin → candidate row then metadata.
 */
export async function fetchNavUserDisplayContext(
  supabase: SupabaseClient,
  user: User,
  profileRow: ProfilesRow | null,
): Promise<{ email: string | null; role: string | null; fullName: string | null }> {
  const email = user.email?.trim() || profileRow?.email?.trim() || null;
  const dbRole = typeof profileRow?.role === "string" ? profileRow.role : null;
  const role =
    isAllowedAdminEmail(email) ? "admin" : dbRole;

  let fullName: string | null = null;

  if (role === "candidate") {
    const { data } = await supabase
      .from("candidate_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (typeof data?.full_name === "string" && data.full_name.trim()) {
      fullName = data.full_name.trim();
    }
    if (!fullName) fullName = fullNameFromUserMetadata(user);
  } else if (role === "recruiter") {
    fullName = fullNameFromUserMetadata(user);
  } else if (role === "admin") {
    const { data } = await supabase
      .from("candidate_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (typeof data?.full_name === "string" && data.full_name.trim()) {
      fullName = data.full_name.trim();
    }
    if (!fullName) fullName = fullNameFromUserMetadata(user);
  } else {
    fullName = fullNameFromUserMetadata(user);
  }

  return { email, role, fullName };
}

/** First whitespace-delimited token, title-cased for display (e.g. "joel" → "Joel"). */
export function firstNameFromFullName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "";
  const match = t.match(/[^\s]+/);
  const token = match?.[0] ?? "";
  if (!token) return "";
  const lower = token.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

/**
 * e.g. joel.sales85@gmail.com → "Joel" (first segment of local part, title-cased).
 */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "";
  const segment = local.split(/[.+_-]/)[0] ?? local;
  const letters = segment.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length >= 1) {
    const lower = letters.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  }
  return "";
}

export function headerDisplayLabel(
  profileFullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const full = profileFullName?.trim();
  if (full) {
    const first = firstNameFromFullName(full);
    if (first) return first;
  }
  const em = email?.trim();
  if (em) {
    const fromEmail = displayNameFromEmail(em);
    if (fromEmail) return fromEmail;
  }
  return "Cuenta";
}

/** Short greeting name, or null if we should show only “Hola”. */
export function welcomeFirstName(
  profileFullName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const label = headerDisplayLabel(profileFullName, email);
  return label === "Cuenta" ? null : label;
}

export function initialsFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0].charAt(0);
    const b = parts[parts.length - 1].charAt(0);
    return (a + b).toUpperCase();
  }
  const w = parts[0] ?? "";
  if (w.length >= 2) return w.slice(0, 2).toUpperCase();
  if (w.length === 1) return w.toUpperCase();
  return "";
}

export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-ZÀ-ÿ0-9]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase().slice(0, 2);
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0]?.charAt(0) ?? "?").toUpperCase();
}

export function avatarInitials(
  profileFullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const full = profileFullName?.trim();
  if (full) {
    const fromName = initialsFromFullName(full);
    if (fromName) return fromName;
  }
  const em = email?.trim();
  if (em) return initialsFromEmail(em);
  return "?";
}
