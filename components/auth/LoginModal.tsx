"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type LoginModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal inline de acceso por magic link (Supabase OTP).
 * No navega al abrir; solo tras seguir el enlace del correo.
 */
export function LoginModal({ open, onClose }: LoginModalProps) {
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const resetForm = useCallback(() => {
    setSent(false);
    setError("");
    setEmail("");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/redirect`,
        },
      });

      if (otpError) {
        setError(
          "No pudimos enviar el enlace. Revisa que el correo esté bien escrito e inténtalo de nuevo.",
        );
        return;
      }
      setSent(true);
    } catch {
      setError("Algo salió mal. Espera un momento e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm transition-opacity"
        aria-label="Cerrar"
        onClick={onClose}
      />

      <div
        className="relative z-[101] w-full max-w-[420px] rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)] ring-1 ring-black/5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="ds-heading text-xl font-semibold tracking-tight text-[#0F172A] sm:text-2xl"
            >
              Accede en segundos
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
              Inicia sesión con tu correo para postularte y desbloquear más
              detalles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-[#94A3B8] transition hover:bg-zinc-100 hover:text-[#0F172A]"
            aria-label="Cerrar"
          >
            <span className="block text-lg leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        {sent ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <p className="text-sm font-medium leading-relaxed text-emerald-900">
                Te enviaremos un enlace para acceder. Revisa tu correo.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-emerald-800/90">
                Revisa tu correo (y spam si no lo ves).
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-zinc-50"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="login-modal-email"
                className="mb-1.5 block text-sm font-medium text-[#334155]"
              >
                Correo electrónico
              </label>
              <input
                id="login-modal-email"
                type="email"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-[#0F172A] shadow-inner outline-none transition placeholder:text-zinc-400 focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                autoFocus
              />
              <p className="mt-2 text-center text-[11px] leading-relaxed text-[#94A3B8]">
                Te enviaremos un enlace para acceder. Crear cuenta es gratis.
              </p>
            </div>

            {error ? (
              <p className="text-sm leading-relaxed text-red-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviar enlace de acceso"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm font-medium text-[#64748B] transition hover:text-[#0F172A]"
            >
              Cerrar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
