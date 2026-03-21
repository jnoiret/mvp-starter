"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function isSafeRoleNextPath(role: string, next: string): boolean {
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  if (next.includes("..")) return false;
  if (role === "candidate" && next.startsWith("/candidate")) return true;
  if (role === "recruiter" && next.startsWith("/recruiter")) return true;
  if (role === "admin" && next.startsWith("/admin")) return true;
  return false;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => searchParams.get("next")?.trim() ?? null,
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();

      const { data, error } = await supabase.auth.signInWithPassword({
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
        setError("No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setError("No se pudo cargar tu perfil.");
        setLoading(false);
        return;
      }

      if (
        profile.role !== "candidate" &&
        profile.role !== "recruiter" &&
        profile.role !== "admin"
      ) {
        setError("Tu perfil no tiene un rol válido.");
        setLoading(false);
        return;
      }

      router.refresh();

      if (nextPath && isSafeRoleNextPath(profile.role, nextPath)) {
        router.push(nextPath);
        return;
      }

      router.push("/auth/redirect");
    } catch (err) {
      console.error(err);
      setError("Ocurrió un error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetLoading(true);
    setResetError("");
    setResetSuccess(false);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (resetErr) {
        setResetError(
          "No pudimos enviar el correo. Revisa la dirección e inténtalo de nuevo.",
        );
        setResetLoading(false);
        return;
      }

      setResetSuccess(true);
    } catch (err) {
      console.error(err);
      setResetError(
        "Algo salió mal al enviar el correo. Inténtalo de nuevo en unos minutos.",
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Iniciar sesión</h1>

      {showForgotPassword ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setShowForgotPassword(false);
              setResetError("");
              setResetSuccess(false);
              setResetEmail("");
            }}
            className="text-sm text-zinc-600 underline underline-offset-2 hover:text-[#0F172A]"
          >
            ← Volver a iniciar sesión
          </button>

          <p className="text-sm leading-relaxed text-zinc-600">
            Te enviaremos un enlace para elegir una nueva contraseña.
          </p>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm">Correo</label>
              <input
                type="email"
                className="w-full rounded border px-3 py-2"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {resetError ? (
              <p className="text-sm text-red-600">{resetError}</p>
            ) : null}

            {resetSuccess ? (
              <p className="text-sm leading-relaxed text-emerald-700">
                Si hay una cuenta asociada a ese correo, recibirás un enlace para
                restablecer tu contraseña. Revisa también la carpeta de spam.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full rounded bg-black px-4 py-2 text-white"
            >
              {resetLoading ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Correo</label>
            <input
              type="email"
              className="w-full rounded border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-sm">Contraseña</label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setResetEmail(email);
                }}
                className="text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-[#0F172A]"
              >
                Olvidé mi contraseña
              </button>
            </div>
            <input
              type="password"
              className="w-full rounded border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black px-4 py-2 text-white"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      )}
    </main>
  );
}
