import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Prefer service role for admin bulk reads/writes (bypasses RLS). Falls back to the
 * session-scoped server client when the key is not configured (requires permissive RLS).
 */
export async function getAdminDataSupabase(): Promise<SupabaseClient> {
  const service = getSupabaseServiceRoleClient();
  if (service) return service;
  return getSupabaseServerClient();
}
