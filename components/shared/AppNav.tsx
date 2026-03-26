"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  effectiveProfileRole,
  isAllowedAdminEmail,
} from "@/lib/admin/adminAllowlist";
import {
  avatarInitials,
  fetchNavUserDisplayContext,
  headerDisplayLabel,
} from "@/lib/auth/navUserLabel";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type NavAuth = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  role: string | null;
  /** Raw full name from candidate_profiles or auth metadata (not shown verbatim in trigger). */
  fullName: string | null;
};

const initialAuth: NavAuth = {
  loading: true,
  userId: null,
  email: null,
  role: null,
  fullName: null,
};

function menuLinkClass(active?: boolean) {
  return [
    "block w-full rounded-lg px-3 py-2 text-left text-sm transition",
    active
      ? "bg-zinc-100 font-medium text-[#0F172A]"
      : "text-zinc-700 hover:bg-zinc-50 hover:text-[#0F172A]",
  ].join(" ");
}

export function AppNav() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [auth, setAuth] = useState<NavAuth>(initialAuth);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadAuth = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setAuth({
          loading: false,
          userId: null,
          email: null,
          role: null,
          fullName: null,
        });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, email")
        .eq("id", session.user.id)
        .maybeSingle();

      const ctx = await fetchNavUserDisplayContext(
        supabase,
        session.user,
        profile,
      );

      setAuth({
        loading: false,
        userId: session.user.id,
        email: ctx.email,
        role: ctx.role,
        fullName: ctx.fullName,
      });
    } catch {
      setAuth({
        loading: false,
        userId: null,
        email: null,
        role: null,
        fullName: null,
      });
    }
  }, []);

  useEffect(() => {
    void loadAuth();

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      setAuth((a) => ({ ...a, loading: false }));
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setAuth({
          loading: false,
          userId: null,
          email: null,
          role: null,
          fullName: null,
        });
        return;
      }
      if (event === "SIGNED_IN") {
        router.refresh();
      }
      void (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", session.user.id)
          .maybeSingle();
        const ctx = await fetchNavUserDisplayContext(
          supabase,
          session.user,
          profile,
        );
        setAuth({
          loading: false,
          userId: session.user.id,
          email: ctx.email,
          role: ctx.role,
          fullName: ctx.fullName,
        });
      })();
    });

    return () => subscription.unsubscribe();
  }, [loadAuth, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      /* still redirect */
    }
    setAuth({
      loading: false,
      userId: null,
      email: null,
      role: null,
      fullName: null,
    });
    router.push("/");
    router.refresh();
  };

  const { loading, userId, email, role, fullName } = auth;
  const signedIn = Boolean(userId);
  const adminAllowed = isAllowedAdminEmail(email);
  const navRole = effectiveProfileRole(email, role);
  const displayLabel = headerDisplayLabel(fullName, email);

  const showAdminStrip = adminAllowed;
  const showRecruiterStrip = navRole === "recruiter" && !adminAllowed;
  const showCandidateMenuLinks = navRole === "candidate" || adminAllowed;
  const showRecruiterMenuLinks = navRole === "recruiter" && !adminAllowed;

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md">
      <div className="mx-auto flex h-[3.25rem] w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-sm font-semibold tracking-tight text-[#0F172A]"
        >
          Fichur
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-4 sm:gap-6">
          {!loading && signedIn && showAdminStrip ? (
            <nav
              className="hidden min-w-0 items-center gap-1 text-[13px] text-zinc-600 sm:flex"
              aria-label="Navegación administración"
            >
              <Link
                href="/admin/dashboard"
                className={`rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A] ${
                  pathname.startsWith("/admin/dashboard")
                    ? "font-medium text-[#0F172A]"
                    : ""
                }`}
              >
                Dashboard
              </Link>
              <span className="text-zinc-300" aria-hidden>
                ·
              </span>
              <Link
                href="/admin"
                className={`rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A] ${
                  /^\/admin\/?$/.test(pathname)
                    ? "font-medium text-[#0F172A]"
                    : ""
                }`}
              >
                Perfiles
              </Link>
              <span className="text-zinc-300" aria-hidden>
                ·
              </span>
              <Link
                href="/admin/users"
                className={`rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A] ${
                  pathname.startsWith("/admin/users")
                    ? "font-medium text-[#0F172A]"
                    : ""
                }`}
              >
                Usuarios
              </Link>
            </nav>
          ) : null}
          {!loading && signedIn && showRecruiterStrip ? (
            <nav
              className="hidden min-w-0 items-center gap-1 text-[13px] text-zinc-600 sm:flex"
              aria-label="Navegación reclutador"
            >
              <Link
                href="/recruiter/dashboard"
                className={`rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A] ${
                  pathname.startsWith("/recruiter/dashboard")
                    ? "font-medium text-[#0F172A]"
                    : ""
                }`}
              >
                Dashboard
              </Link>
              <span className="text-zinc-300" aria-hidden>
                ·
              </span>
              <Link
                href="/recruiter/jobs/new"
                className="rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A]"
              >
                Nueva vacante
              </Link>
              <span className="text-zinc-300" aria-hidden>
                ·
              </span>
              <Link
                href="/recruiter/shortlist"
                className={`rounded-md px-2 py-1 transition hover:bg-zinc-100 hover:text-[#0F172A] ${
                  pathname.startsWith("/recruiter/shortlist")
                    ? "font-medium text-[#0F172A]"
                    : ""
                }`}
              >
                Shortlist
              </Link>
            </nav>
          ) : null}

          <nav
            className="flex shrink-0 items-center gap-2 sm:gap-3"
            aria-label="Principal"
          >
            {loading ? (
              <div
                className="h-8 w-24 animate-pulse rounded-full bg-zinc-100"
                aria-hidden
              />
            ) : !signedIn ? (
              <div className="flex max-w-[min(100vw-5rem,28rem)] flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:max-w-none">
                <Link
                  href="/jobs"
                  className="text-sm text-zinc-600 transition hover:text-[#0F172A]"
                >
                  <span className="sm:hidden">Vacantes</span>
                  <span className="hidden sm:inline">Explorar vacantes</span>
                </Link>
                <Link
                  href="/onboarding"
                  className="max-w-[11rem] truncate text-sm text-zinc-600 transition hover:text-[#0F172A] sm:max-w-none"
                >
                  <span className="sm:hidden">Perfil con IA</span>
                  <span className="hidden sm:inline">Crear perfil con IA</span>
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] shadow-sm transition hover:border-zinc-300"
                >
                  Entrar
                </Link>
                <Link
                  href="/#reclutadores"
                  className="w-full text-right text-xs text-zinc-400 transition hover:text-zinc-600 sm:ml-1 sm:w-auto sm:text-left"
                >
                  Para reclutadores
                </Link>
              </div>
            ) : (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex max-w-full min-w-0 items-center gap-2 rounded-full border border-zinc-200/90 bg-white py-1 pl-1 pr-2.5 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50/80"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`Menú de cuenta: ${displayLabel}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white shadow-inner"
                    aria-hidden
                  >
                    {avatarInitials(fullName, email)}
                  </span>
                  <span className="min-w-0 max-w-[6.5rem] truncate text-sm font-medium tracking-tight text-[#0F172A] sm:max-w-[11rem]">
                    {displayLabel}
                  </span>
                  <span className="shrink-0 text-zinc-400" aria-hidden>
                    ▾
                  </span>
                </button>

                {menuOpen ? (
                  <div
                    className="absolute right-0 mt-2 w-[min(100vw-2rem,17rem)] rounded-xl border border-zinc-200/90 bg-white py-1.5 shadow-lg shadow-zinc-900/5 ring-1 ring-black/5"
                    role="menu"
                  >
                    <div className="border-b border-zinc-100 px-3 pb-2.5 pt-0.5">
                      <p className="text-sm font-medium tracking-tight text-[#0F172A]">
                        {displayLabel}
                      </p>
                      {email ? (
                        <p
                          className="mt-1 break-all text-[11px] leading-snug text-zinc-500"
                          title={email}
                        >
                          {email}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-zinc-400">
                          Sin correo en la sesión
                        </p>
                      )}
                    </div>

                    {showCandidateMenuLinks ? (
                      <>
                        <Link
                          href="/candidate/dashboard"
                          role="menuitem"
                          className={menuLinkClass(
                            pathname.startsWith("/candidate/dashboard"),
                          )}
                          onClick={() => setMenuOpen(false)}
                        >
                          Mi perfil
                        </Link>
                        <Link
                          href="/candidate/jobs"
                          role="menuitem"
                          className={menuLinkClass(
                            pathname.startsWith("/candidate/jobs"),
                          )}
                          onClick={() => setMenuOpen(false)}
                        >
                          Vacantes
                        </Link>
                        <Link
                          href="/candidate/applications"
                          role="menuitem"
                          className={menuLinkClass(
                            pathname.startsWith("/candidate/applications"),
                          )}
                          onClick={() => setMenuOpen(false)}
                        >
                          Postulaciones
                        </Link>
                      </>
                    ) : null}

                    {showRecruiterMenuLinks ? (
                      <>
                        <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:hidden">
                          Panel reclutador
                        </p>
                        <Link
                          href="/recruiter/dashboard"
                          role="menuitem"
                          className={`${menuLinkClass()} sm:hidden`}
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard
                        </Link>
                        <Link
                          href="/recruiter/jobs/new"
                          role="menuitem"
                          className={`${menuLinkClass()} sm:hidden`}
                          onClick={() => setMenuOpen(false)}
                        >
                          Nueva vacante
                        </Link>
                        <Link
                          href="/recruiter/shortlist"
                          role="menuitem"
                          className={`${menuLinkClass()} sm:hidden`}
                          onClick={() => setMenuOpen(false)}
                        >
                          Shortlist
                        </Link>
                        <Link
                          href="/recruiter/dashboard"
                          role="menuitem"
                          className={`${menuLinkClass()} hidden sm:block`}
                          onClick={() => setMenuOpen(false)}
                        >
                          Cuenta
                        </Link>
                      </>
                    ) : null}

                    {adminAllowed ? (
                      <>
                        <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                          Administración
                        </p>
                        <Link
                          href="/admin/dashboard"
                          role="menuitem"
                          className={menuLinkClass(
                            pathname.startsWith("/admin/dashboard"),
                          )}
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard admin
                        </Link>
                        <Link
                          href="/admin"
                          role="menuitem"
                          className={menuLinkClass(/^\/admin\/?$/.test(pathname))}
                          onClick={() => setMenuOpen(false)}
                        >
                          Lista de perfiles
                        </Link>
                        <Link
                          href="/admin/users"
                          role="menuitem"
                          className={menuLinkClass(
                            pathname.startsWith("/admin/users"),
                          )}
                          onClick={() => setMenuOpen(false)}
                        >
                          Gestionar usuarios
                        </Link>
                      </>
                    ) : null}

                    {signedIn && !navRole ? (
                      <Link
                        href="/auth/redirect"
                        role="menuitem"
                        className={menuLinkClass()}
                        onClick={() => setMenuOpen(false)}
                      >
                        Completar cuenta
                      </Link>
                    ) : null}

                    {role === "admin" && !adminAllowed ? (
                      <p className="px-3 py-2 text-xs text-zinc-500">
                        Esta cuenta tiene rol admin en la base de datos, pero el correo no está
                        autorizado para la consola.
                      </p>
                    ) : null}

                    <div className="mx-2 my-1 border-t border-zinc-100" />
                    <button
                      type="button"
                      role="menuitem"
                      className={menuLinkClass()}
                      onClick={() => void handleSignOut()}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
