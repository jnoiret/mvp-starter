import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          App name
        </Link>
        <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href="/admin"
            className="hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

