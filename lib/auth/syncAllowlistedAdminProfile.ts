import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export type SyncAllowlistedAdminResult =
  | { ok: true; synced: boolean }
  | { ok: false; error: string };

/**
 * If the authenticated user's email is in the admin allowlist, upsert `public.profiles`
 * with `role: "admin"` and aligned `email`. Uses the service-role key when set (recommended
 * if RLS blocks role changes); otherwise uses the user's session client.
 */
export async function syncAllowlistedAdminProfileForUser(params: {
  userId: string;
  email: string;
}): Promise<SyncAllowlistedAdminResult> {
  const email = params.email.trim();
  if (!params.userId || !email) {
    return { ok: false, error: "missing_user_or_email" };
  }
  if (!isAllowedAdminEmail(email)) {
    return { ok: true, synced: false };
  }

  const row = { id: params.userId, email, role: "admin" as const };

  const service = getSupabaseServiceRoleClient();
  if (service) {
    const { error } = await service.from("profiles").upsert(row, {
      onConflict: "id",
    });
    if (error) {
      console.error("[syncAllowlistedAdminProfile] service upsert failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, synced: true };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("profiles").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    console.error("[syncAllowlistedAdminProfile] session upsert failed", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, synced: true };
}
