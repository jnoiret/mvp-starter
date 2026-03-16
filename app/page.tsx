import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="ds-page min-h-[calc(100vh-4rem)] px-6 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-5xl">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-zinc-600">Fichur</p>
          <h1 className="ds-heading mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
            Encuentra el trabajo perfecto con{" "}
            <span className="ds-accent-text">inteligencia artificial</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
            Fichur analiza tu perfil y te conecta con las oportunidades que
            mejor se adaptan a ti. Match inteligente, recomendaciones
            personalizadas.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/candidate/onboarding">
              <Button>Comenzar gratis</Button>
            </Link>
            <Link href="/#vacantes">
              <Button variant="secondary" className="shadow-sm">
                Ver vacantes
              </Button>
            </Link>
          </div>
        </section>

        <section
          id="vacantes"
          className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-3 sm:gap-8"
        >
          <div className="ds-card p-6">
            <h2 className="ds-heading text-lg font-semibold tracking-tight">
              Análisis con IA
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Tu CV analizado por inteligencia artificial para destacar tus
              fortalezas y áreas de mejora
            </p>
          </div>

          <div className="ds-card p-6">
            <h2 className="ds-heading text-lg font-semibold tracking-tight">
              Match Score
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Descubre qué tan compatible eres con cada vacante y qué necesitas
              aprender
            </p>
          </div>

          <div className="ds-card p-6">
            <h2 className="ds-heading text-lg font-semibold tracking-tight">
              Recomendaciones
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Obtén consejos personalizados para mejorar tu perfil y aumentar tus
              opciones
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
