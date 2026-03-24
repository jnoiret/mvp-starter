"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";

export function RoleOnboardingForm() {
  const router = useRouter();
  const [role, setRole] = useState<"candidate" | "recruiter">("candidate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("No hay sesión activa. Vuelve a entrar con tu correo.");
        setLoading(false);
        return;
      }

      const email = user.email ?? null;
      if (!email) {
        setError("Tu cuenta no tiene correo asociado.");
        setLoading(false);
        return;
      }

      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email,
          role,
        },
        { onConflict: "id" },
      );

      if (upsertError) {
        setError(
          upsertError.message ||
            "No se pudo guardar tu perfil. Inténtalo de nuevo.",
        );
        setLoading(false);
        return;
      }

      router.refresh();
      if (role === "candidate") {
        router.push("/candidate/dashboard");
      } else {
        router.push("/recruiter/dashboard");
      }
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <OnboardingProgress step={1} totalSteps={5} label="Cuenta" />
      <h1 className="mb-2 text-2xl font-semibold text-[#0F172A]">
        ¿Cómo usarás Fichur?
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-zinc-600">
        Elige cómo quieres usar Fichur.
      </p>

      <form onSubmit={handleContinue} className="space-y-6">
        <fieldset>
          <legend className="sr-only">Tu rol en Fichur</legend>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setRole("candidate")}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                role === "candidate"
                  ? "border-[#0F172A] bg-white shadow-sm"
                  : "border-zinc-200 bg-white/60 hover:border-zinc-300"
              }`}
            >
              <span className="block font-semibold text-[#0F172A]">
                Quiero encontrar trabajo
              </span>
              <span className="mt-1 block text-sm text-zinc-600">
                Vacantes, perfil con IA y postulaciones.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRole("recruiter")}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                role === "recruiter"
                  ? "border-[#0F172A] bg-white shadow-sm"
                  : "border-zinc-200 bg-white/60 hover:border-zinc-300"
              }`}
            >
              <span className="block font-semibold text-[#0F172A]">
                Quiero contratar talento
              </span>
              <span className="mt-1 block text-sm text-zinc-600">
                Publica vacantes y gestiona candidatos.
              </span>
            </button>
          </div>
        </fieldset>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white"
        >
          {loading ? "Guardando…" : "Continuar"}
        </button>
      </form>
    </main>
  );
}
