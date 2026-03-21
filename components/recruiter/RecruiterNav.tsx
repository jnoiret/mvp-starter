import Link from "next/link";

const links = [
  { href: "/recruiter/dashboard", label: "Inicio" },
  { href: "/recruiter/jobs/new", label: "Crear vacante" },
  { href: "/recruiter/shortlist", label: "Shortlist" },
] as const;

export function RecruiterNav() {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
