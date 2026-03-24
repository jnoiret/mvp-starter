import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { syncAllowlistedAdminProfileForUser } from "@/lib/auth/syncAllowlistedAdminProfile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  const email = (user.email ?? profile?.email ?? "").trim();
  if (!email || !isAllowedAdminEmail(email)) {
    redirect("/");
  }

  const sync = await syncAllowlistedAdminProfileForUser({
    userId: user.id,
    email,
  });
  if (!sync.ok) {
    redirect("/auth/redirect");
  }

  const supabase = await getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || row?.role !== "admin") {
    redirect("/auth/redirect");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-xs font-medium text-zinc-500">Fichur · Admin</p>
          <Link
            href="/admin/dashboard"
            className="text-lg font-semibold text-[#0F172A]"
          >
            Administración
          </Link>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/dashboard"
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 font-medium text-[#0F172A] shadow-sm hover:border-zinc-300"
          >
            Dashboard
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 font-medium text-[#0F172A] shadow-sm hover:border-zinc-300"
          >
            Perfiles
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
