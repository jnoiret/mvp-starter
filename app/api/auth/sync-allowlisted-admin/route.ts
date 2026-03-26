import { NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/auth/apiRbac";
import { syncAllowlistedAdminProfileForUser } from "@/lib/auth/syncAllowlistedAdminProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — session cookie. Upserts admin profile row when email is allowlisted.
 */
export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return apiUnauthorized();
  }

  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { success: false, error: "no_email" },
      { status: 400 },
    );
  }

  const result = await syncAllowlistedAdminProfileForUser({
    userId: user.id,
    email,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, synced: result.synced });
}
