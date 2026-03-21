import Link from "next/link";
import { Button } from "@/components/ui/Button";

const steps = [
  {
    title: "Sube tu CV",
    body: "Añade tu experiencia en minutos para que podamos entender tu trayectoria.",
  },
  {
    title: "Analizamos tu perfil con IA",
    body: "Extraemos fortalezas, brechas y señales clave para representarte con precisión.",
  },
  {
    title: "Descubre vacantes con mejor match",
    body: "Ve oportunidades ordenadas por encaje real, no solo por palabras clave.",
  },
] as const;

const differentiators = [
  {
    title: "Match explicado",
    body: "Entiende por qué encajas (o qué te falta) en cada vacante, con lenguaje claro.",
  },
  {
    title: "Perfil inteligente",
    body: "Un perfil vivo que refleja lo que aportas, más allá del formato del CV.",
  },
  {
    title: "Recomendaciones accionables",
    body: "Sugerencias concretas para mejorar tu encaje y priorizar donde invertir tiempo.",
  },
] as const;

export default function Home() {
  return (
    <main className="ds-page min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-5xl px-6">
        {/* Hero */}
        <section className="mx-auto max-w-3xl pt-16 pb-20 text-center sm:pt-20 sm:pb-24">
          <h1 className="ds-heading text-4xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.08] lg:text-6xl">
            Encuentra vacantes donde realmente encajas
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 sm:text-xl sm:leading-relaxed">
            Fichur analiza tu perfil con inteligencia artificial y te conecta con
            oportunidades que sí hacen sentido para ti.
          </p>

          <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link href="/login?next=/candidate/jobs">
              <Button>Explorar vacantes</Button>
            </Link>
            <Link href="/signup">
              <Button variant="secondary" className="min-w-[12rem] shadow-sm">
                Crear perfil con IA
              </Button>
            </Link>
          </div>

          <p className="mt-10 text-sm text-zinc-500">
            <Link
              href="#reclutadores"
              className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-[5px] transition hover:text-[#0F172A] hover:decoration-zinc-400"
            >
              ¿Eres reclutador o empresa? Conoce Fichur para reclutadores
            </Link>
          </p>
        </section>

        {/* Cómo funciona */}
        <section
          aria-labelledby="como-funciona-heading"
          className="border-t border-zinc-100/80 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="como-funciona-heading"
              className="ds-heading text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Cómo funciona
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Tres pasos para pasar del CV a las vacantes que merecen tu tiempo.
            </p>
          </div>
          <ol className="mx-auto mt-14 grid max-w-4xl gap-10 sm:grid-cols-3 sm:gap-8">
            {steps.map((step, i) => (
              <li key={step.title} className="relative text-center sm:text-left">
                <div className="mb-4 flex justify-center sm:justify-start">
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-[#0F172A] shadow-sm"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                </div>
                <h3 className="ds-heading text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Diferenciadores */}
        <section
          aria-labelledby="por-que-fichur-heading"
          className="border-t border-zinc-100/80 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="por-que-fichur-heading"
              className="ds-heading text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Por qué Fichur
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Diseñado para candidatos que quieren claridad, no ruido.
            </p>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-3 sm:gap-8">
            {differentiators.map((block) => (
              <div key={block.title} className="ds-card p-8">
                <h3 className="ds-heading text-lg font-semibold tracking-tight">
                  {block.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  {block.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Reclutadores */}
        <section
          id="reclutadores"
          className="scroll-mt-24 border-t border-zinc-100/80 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-2xl rounded-3xl border border-zinc-200/80 bg-white/70 px-8 py-12 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_64px_rgba(15,23,42,0.06)] sm:px-12 sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Para equipos que contratan
            </p>
            <h2 className="ds-heading mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Para reclutadores y empresas
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-zinc-600">
              Publica una vacante y recibe candidatos rankeados con explicación de
              compatibilidad.
            </p>
            <div className="mt-10">
              <Link href="/signup?role=recruiter">
                <Button variant="secondary" className="shadow-sm">
                  Entrar como reclutador
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login?next=/recruiter/dashboard"
                className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-[#0F172A]"
              >
                Iniciar sesión
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
