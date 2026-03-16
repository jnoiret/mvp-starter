import Link from "next/link";

const links = [
  { href: "/candidate/onboarding", label: "Onboarding" },
  { href: "/candidate/dashboard", label: "Dashboard" },
  { href: "/candidate/jobs", label: "Vacantes" },
  { href: "/candidate/applications", label: "Postulaciones" },
] as const;

export function CandidateNav() {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

