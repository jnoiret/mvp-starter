import { NextResponse } from "next/server";
import { assertAdminRequester } from "@/lib/admin/assertAdminRequester";
import {
  isAllowedAdminEmail,
  isManageableProfileRole,
} from "@/lib/admin/adminAllowlist";
import { getAdminDataSupabase } from "@/lib/admin/getAdminDataSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  target_user_id?: string;
  role?: string;
  confirm_self_demotion?: boolean;
};

export async function PATCH(request: Request) {
  const gate = await assertAdminRequester();
  if ("error" in gate) return gate.error;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Cuerpo JSON inválido." },
      { status: 400 },
    );
  }

  const targetUserId =
    typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";

  if (!targetUserId) {
    return NextResponse.json(
      { success: false, error: "Falta target_user_id." },
      { status: 400 },
    );
  }

  if (!isManageableProfileRole(role)) {
    return NextResponse.json(
      { success: false, error: "Rol no válido." },
      { status: 400 },
    );
  }

  const db = await getAdminDataSupabase();

  const { data: targetRow, error: fetchErr } = await db
    .from("profiles")
    .select("id, email, role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { success: false, error: fetchErr.message },
      { status: 500 },
    );
  }

  if (!targetRow?.id) {
    return NextResponse.json(
      { success: false, error: "Usuario no encontrado." },
      { status: 404 },
    );
  }

  const targetEmail =
    typeof targetRow.email === "string" ? targetRow.email.trim() : "";

  if (isAllowedAdminEmail(targetEmail) && role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Los correos en la lista de administradores deben conservar el rol admin en la base de datos (el acceso efectivo sigue gobernado por la lista).",
        code: "ALLOWLIST_REQUIRES_ADMIN" as const,
      },
      { status: 400 },
    );
  }

  if (targetUserId === gate.userId && role !== "admin") {
    if (!body.confirm_self_demotion) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Para dejarte de administrador debes confirmar la acción en el panel.",
          code: "CONFIRM_SELF_DEMOTION" as const,
        },
        { status: 409 },
      );
    }
  }

  const { error: updateErr } = await db
    .from("profiles")
    .update({ role })
    .eq("id", targetUserId);

  if (updateErr) {
    return NextResponse.json(
      { success: false, error: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true as const,
    user: {
      id: targetUserId,
      email: targetEmail || null,
      role,
    },
  });
}
