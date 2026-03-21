"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialRole = useMemo(() => {
    const r = searchParams.get("role");
    if (r === "recruiter") return "recruiter" as const;
    return "candidate" as const;
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"candidate" | "recruiter">(initialRole);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const user = data.user;

      if (!user) {
        setError("No se pudo crear el usuario.");
        setLoading(false);
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email ?? email,
        role,
      });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/auth/redirect");
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error al crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Crear cuenta</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Elige cómo quieres usar Fichur y completa tus datos.
      </p>

      <form onSubmit={handleSignup} className="space-y-6">
        <fieldset>
          <legend className="sr-only">Tipo de cuenta</legend>
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
              <span className="ds-heading block font-semibold text-[#0F172A]">
                Quiero encontrar trabajo
              </span>
              <span className="mt-1 block text-sm text-zinc-600">
                Explora vacantes, crea tu perfil con IA y postúlate.
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
              <span className="ds-heading block font-semibold text-[#0F172A]">
                Quiero contratar talento
              </span>
              <span className="mt-1 block text-sm text-zinc-600">
                Publica vacantes y gestiona candidatos desde tu panel.
              </span>
            </button>
          </div>
        </fieldset>

        <div className="space-y-4 border-t border-zinc-100 pt-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Correo</label>
            <input
              type="email"
              className="w-full rounded border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full rounded border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 text-white"
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>
    </main>
  );
}
