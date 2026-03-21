"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const resolveSession = (session: unknown) => {
      if (cancelled) return;
      if (session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
        return true;
      }
      return false;
    };

    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (resolveSession(session)) return;
      attempts += 1;
      if (attempts >= maxAttempts) {
        setHasRecoverySession(false);
        setCheckingSession(false);
        return;
      }
      window.setTimeout(poll, 150);
    };

    void poll();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (
        session &&
        (event === "PASSWORD_RECOVERY" ||
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION")
      ) {
        resolveSession(session);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(
          updateError.message ||
            "No se pudo actualizar la contraseña. Prueba de nuevo o solicita un nuevo enlace.",
        );
        setLoading(false);
        return;
      }

      setSuccess(true);
      await supabase.auth.signOut();
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error inesperado. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <p className="text-sm text-zinc-600">Comprobando enlace…</p>
      </main>
    );
  }

  if (!hasRecoverySession) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-2 text-2xl font-semibold">Restablecer contraseña</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-600">
          Este enlace no es válido o ha caducado. Solicita uno nuevo desde la
          pantalla de inicio de sesión.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-zinc-800 underline underline-offset-2 hover:text-black"
        >
          Volver a iniciar sesión
        </Link>
      </main>
    );
  }

  if (success) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-2 text-2xl font-semibold">Contraseña actualizada</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-600">
          Tu contraseña se ha cambiado correctamente. Ya puedes iniciar sesión con
          la nueva.
        </p>
        <Link
          href="/login"
          className="inline-block rounded bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Ir a iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Nueva contraseña</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm">Nueva contraseña</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm">Confirmar contraseña</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 text-white"
        >
          {loading ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
