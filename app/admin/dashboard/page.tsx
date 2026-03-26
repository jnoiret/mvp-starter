"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingState } from "@/components/shared/LoadingState";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import type { AdminDashboardLoadResult } from "@/lib/admin/dashboardMetrics";
import { parseDashboardApiResponse } from "@/lib/admin/parseDashboardResponse";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AdminDashboardView } from "./AdminDashboardView";

const isDevelopment = process.env.NODE_ENV === "development";
const devAuthBypassEnabled =
  isDevelopment && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

type Phase =
  | { kind: "checking" }
  | { kind: "forbidden" }
  | { kind: "unauthorized_redirect" }
  | { kind: "loading_data" }
  | { kind: "fetch_error"; message: string; showLoginLink?: boolean }
  | {
      kind: "ready";
      result: AdminDashboardLoadResult;
      /** Set in development when auth is bypassed (simulated admin). */
      devSimulatedEmail?: string;
    };

export default function AdminDashboardPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (devAuthBypassEnabled) {
        setPhase({ kind: "loading_data" });
        const res = await fetch("/api/admin/dashboard-data", {
          credentials: "same-origin",
          redirect: "manual",
        });

        if (cancelled) return;

        let parsed: Awaited<ReturnType<typeof parseDashboardApiResponse>>;
        try {
          parsed = await parseDashboardApiResponse(res);
        } catch (err) {
          console.error("[admin/dashboard] parse failed (dev)", err);
          setPhase({
            kind: "fetch_error",
            message: "No pudimos cargar el dashboard.",
            showLoginLink: false,
          });
          return;
        }

        if (parsed.kind === "failure") {
          if (parsed.authRelated && parsed.status === 401) {
            router.replace("/login");
            setPhase({ kind: "unauthorized_redirect" });
            return;
          }
          if (parsed.authRelated && parsed.status === 403) {
            setPhase({ kind: "forbidden" });
            return;
          }
          setPhase({
            kind: "fetch_error",
            message: parsed.userMessage || "No pudimos cargar el dashboard.",
            showLoginLink: parsed.authRelated,
          });
          return;
        }

        const userEmail = "joel.sales85@gmail.com";
        setPhase({
          kind: "ready",
          result: parsed.payload.result,
          devSimulatedEmail: userEmail,
        });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      const email = session?.user?.email?.trim();
      const accessToken = session?.access_token;

      if (!accessToken || !email) {
        router.replace("/login");
        setPhase({ kind: "unauthorized_redirect" });
        return;
      }

      if (!isAllowedAdminEmail(email)) {
        setPhase({ kind: "forbidden" });
        return;
      }

      setPhase({ kind: "loading_data" });

      const res = await fetch("/api/admin/dashboard-data", {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "same-origin",
        redirect: "manual",
      });

      if (cancelled) return;

      let parsed: Awaited<ReturnType<typeof parseDashboardApiResponse>>;
      try {
        parsed = await parseDashboardApiResponse(res);
      } catch (err) {
        console.error("[admin/dashboard] parse failed", err);
        setPhase({
          kind: "fetch_error",
          message: "No pudimos cargar el dashboard.",
          showLoginLink: false,
        });
        return;
      }

      if (parsed.kind === "failure") {
        if (parsed.authRelated && parsed.status === 401) {
          router.replace("/login");
          setPhase({ kind: "unauthorized_redirect" });
          return;
        }
        if (parsed.authRelated && parsed.status === 403) {
          setPhase({ kind: "forbidden" });
          return;
        }
        setPhase({
          kind: "fetch_error",
          message: parsed.userMessage || "No pudimos cargar el dashboard.",
          showLoginLink: parsed.authRelated,
        });
        return;
      }

      setPhase({
        kind: "ready",
        result: parsed.payload.result,
        devSimulatedEmail: undefined,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (
    phase.kind === "checking" ||
    phase.kind === "loading_data" ||
    phase.kind === "unauthorized_redirect"
  ) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-12 md:px-8">
        <LoadingState />
      </div>
    );
  }

  if (phase.kind === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center md:px-8">
        <h1 className="text-xl font-semibold text-[#0F172A]">No autorizado</h1>
        <p className="mt-2 text-sm text-[#475569]">
          Tu cuenta no tiene acceso a esta sección.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
          >
            Ir a iniciar sesión
          </Link>
          <Link
            href="/"
            className="text-sm text-[#64748B] hover:text-[#0F172A]"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "fetch_error") {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center md:px-8">
        <h1 className="text-xl font-semibold text-rose-900">
          No pudimos cargar el dashboard
        </h1>
        <p className="mt-2 text-sm text-rose-800/90">{phase.message}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          {phase.showLoginLink ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
            >
              Ir a iniciar sesión
            </Link>
          ) : null}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdminDashboardView
      result={phase.result}
      devSimulatedEmail={phase.devSimulatedEmail}
    />
  );
}
