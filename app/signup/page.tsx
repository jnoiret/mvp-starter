"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"candidate" | "recruiter">("candidate");
  const [loading, setLoading] = useState(false);
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

      if (role === "candidate") {
        router.push("/candidate/dashboard");
        return;
      }

      router.push("/recruiter/jobs/new");
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error al crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Crear cuenta</h1>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="mb-1 block">Correo</label>
          <input
            type="email"
            className="w-full rounded border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block">Contraseña</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block">Quiero usar Fichur como</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "candidate" | "recruiter")
            }
          >
            <option value="candidate">Candidato</option>
            <option value="recruiter">Reclutador</option>
          </select>
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