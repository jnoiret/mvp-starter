import Link from "next/link";
import { AdminUsersClient } from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
            Usuarios
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">
            Gestiona el rol de cada cuenta en{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs">public.profiles</code>
            . Solo administradores autenticados pueden aplicar cambios.
          </p>
        </div>
        <Link
          href="/admin/dashboard"
          className="shrink-0 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-[#0F172A] shadow-sm transition hover:border-zinc-300"
        >
          ← Volver al dashboard
        </Link>
      </div>
      <AdminUsersClient />
    </div>
  );
}
