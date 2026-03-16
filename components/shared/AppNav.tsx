import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-[#0F172A]"
        >
          App name
        </Link>
        <nav className="flex items-center gap-4 text-sm text-[#475569]">
          <Link
            href="/admin"
            className="hover:text-[#0F172A]"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

