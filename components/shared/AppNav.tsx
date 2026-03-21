import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";

export async function AppNav() {
  const { user, profile } = await getCurrentProfile();
  const role = profile?.role;

  return (
    <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-[#0F172A]"
        >
          Fichur
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-3 text-sm text-[#475569]">
          {!user ? (
            <>
              <Link href="/#reclutadores" className="hover:text-[#0F172A]">
                Para reclutadores
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-medium text-[#0F172A] shadow-sm hover:border-zinc-300"
              >
                Iniciar sesión
              </Link>
            </>
          ) : role === "candidate" ? (
            <>
              <Link href="/candidate/dashboard" className="hover:text-[#0F172A]">
                Dashboard
              </Link>
              <Link href="/candidate/jobs" className="hover:text-[#0F172A]">
                Vacantes
              </Link>
              <Link href="/candidate/applications" className="hover:text-[#0F172A]">
                Postulaciones
              </Link>
            </>
          ) : role === "recruiter" ? (
            <>
              <Link href="/recruiter/dashboard" className="hover:text-[#0F172A]">
                Panel
              </Link>
              <Link href="/recruiter/jobs/new" className="hover:text-[#0F172A]">
                Crear vacante
              </Link>
              <Link href="/recruiter/shortlist" className="hover:text-[#0F172A]">
                Shortlist
              </Link>
            </>
          ) : role === "admin" && isAllowedAdminEmail(user.email ?? profile?.email) ? (
            <>
              <Link href="/admin/dashboard" className="hover:text-[#0F172A]">
                Admin dashboard
              </Link>
              <Link href="/admin" className="hover:text-[#0F172A]">
                Perfiles
              </Link>
              <span className="hidden text-zinc-300 sm:inline">|</span>
              <Link href="/candidate/dashboard" className="hover:text-[#0F172A]">
                Candidato
              </Link>
              <Link href="/recruiter/dashboard" className="hover:text-[#0F172A]">
                Reclutador
              </Link>
            </>
          ) : role === "admin" ? (
            <span className="text-xs text-zinc-500">Sesión admin restringida</span>
          ) : (
            <Link href="/auth/redirect" className="hover:text-[#0F172A]">
              Mi cuenta
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
