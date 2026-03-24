import Link from "next/link";

export default function PublicJobNotFound() {
  return (
    <main className="ds-page mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="ds-heading text-xl font-semibold">Vacante no encontrada</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Es posible que ya no esté publicada o el enlace no sea válido.
      </p>
      <Link
        href="/jobs"
        className="mt-6 inline-block text-sm font-medium text-[#0F172A] underline"
      >
        Ver todas las vacantes
      </Link>
    </main>
  );
}
