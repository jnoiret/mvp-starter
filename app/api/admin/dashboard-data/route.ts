import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { loadAdminDashboardMetrics } from "@/lib/admin/dashboardMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    {
      success: false as const,
      error,
      ...(code ? { code } : {}),
    },
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}

function jsonSuccess(
  result: Awaited<ReturnType<typeof loadAdminDashboardMetrics>>
) {
  return NextResponse.json(
    { success: true as const, result },
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}

export async function GET(request: Request) {
  console.log("[admin dashboard api] route hit");

  try {
    // DEV: bypass auth (explicit opt-in)
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEV_AUTH_BYPASS === "true"
    ) {
      const result = await loadAdminDashboardMetrics();
      return jsonSuccess(result);
    }

    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;

    if (!token) {
      return jsonError(401, "No autorizado", "no_session");
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return jsonError(
        500,
        "Error de configuración del servidor.",
        "server_config"
      );
    }

    const supabaseAuth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user?.email) {
      return jsonError(401, "No autorizado", "invalid_session");
    }

    if (!isAllowedAdminEmail(user.email)) {
      return jsonError(403, "No autorizado", "forbidden");
    }

    const result = await loadAdminDashboardMetrics();
    return jsonSuccess(result);
  } catch (err) {
    console.error("[api/admin/dashboard-data] unexpected error", err);

    return jsonError(
      500,
      "Error interno al cargar el dashboard.",
      "internal_error"
    );
  }
}