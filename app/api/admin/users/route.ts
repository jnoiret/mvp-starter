import { NextResponse } from "next/server";
import { assertAdminRequester } from "@/lib/admin/assertAdminRequester";
import { getAdminDataSupabase } from "@/lib/admin/getAdminDataSupabase";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_USERS = 500;

function asRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((r) => r != null && typeof r === "object") as Record<
    string,
    unknown
  >[];
}

export async function GET() {
  const gate = await assertAdminRequester();
  if ("error" in gate) return gate.error;

  const db = await getAdminDataSupabase();

  let profilesRaw: Record<string, unknown>[] = [];
  let profilesErr: { message: string } | null = null;

  const withCreated = await db
    .from("profiles")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_USERS);

  if (withCreated.error) {
    const fallback = await db
      .from("profiles")
      .select("id, email, role")
      .limit(MAX_USERS);
    if (fallback.error) {
      profilesErr = { message: fallback.error.message };
    } else {
      profilesRaw = asRows(fallback.data);
    }
  } else {
    profilesRaw = asRows(withCreated.data);
  }

  if (profilesErr) {
    return NextResponse.json(
      { success: false, error: profilesErr.message },
      { status: 500 },
    );
  }

  const ids = profilesRaw
    .map((r) => String(r.id ?? ""))
    .filter(Boolean);

  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: candidates } = await db
      .from("candidate_profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const row of asRows(candidates)) {
      const id = String(row.id ?? "");
      const fn = row.full_name;
      if (
        id &&
        typeof fn === "string" &&
        fn.trim()
      ) {
        nameById.set(id, fn.trim());
      }
    }
  }

  const users = profilesRaw.map((row) => {
    const id = String(row.id ?? "");
    const email =
      typeof row.email === "string" && row.email.trim()
        ? row.email.trim()
        : null;
    const role =
      typeof row.role === "string" && row.role.trim()
        ? row.role.trim()
        : "candidate";
    const created_at =
      typeof row.created_at === "string" && row.created_at
        ? row.created_at
        : null;
    return {
      id,
      email,
      role,
      full_name: nameById.get(id) ?? null,
      created_at,
      is_allowlisted_admin: isAllowedAdminEmail(email),
    };
  });

  return NextResponse.json({
    success: true as const,
    requester_id: gate.userId,
    users,
  });
}
