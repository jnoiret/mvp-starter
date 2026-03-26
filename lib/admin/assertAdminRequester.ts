import { NextResponse } from "next/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { syncAllowlistedAdminProfileForUser } from "@/lib/auth/syncAllowlistedAdminProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AdminRequesterOk = {
  userId: string;
  email: string;
};

/**
 * Verifies the cookie session user is an allowlisted admin with `profiles.role = admin`
 * (after syncing allowlisted profile). Does not trust client-sent roles.
 */
export async function assertAdminRequester(): Promise<
  AdminRequesterOk | { error: NextResponse }
> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user.email?.trim()) {
    return {
      error: NextResponse.json(
        { success: false, error: "No autorizado." },
        { status: 401 },
      ),
    };
  }

  const email = user.email.trim();
  if (!isAllowedAdminEmail(email)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Acceso denegado." },
        { status: 403 },
      ),
    };
  }

  const sync = await syncAllowlistedAdminProfileForUser({
    userId: user.id,
    email,
  });
  if (!sync.ok) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: "No se pudo validar el perfil de administrador.",
        },
        { status: 503 },
      ),
    };
  }

  const { data: row, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || row?.role !== "admin") {
    return {
      error: NextResponse.json(
        { success: false, error: "Acceso denegado." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, email };
}
