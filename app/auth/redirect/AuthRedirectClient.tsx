"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { isAllowedAdminEmail } from "@/lib/admin/adminAllowlist";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  shouldApplyOnboardingDraft,
} from "@/lib/auth/onboardingDraftStorage";
import {
  clearPostLoginRedirect,
  isSafeJobsPostLoginPath,
  parsePostLoginRedirectPayload,
  pathReferencesJobId,
  POST_LOGIN_REDIRECT_KEY,
} from "@/lib/auth/postLoginRedirect";
import { LoadingState } from "@/components/shared/LoadingState";
import { markShowFirstJobsAfterOnboarding } from "@/lib/onboardingFirstJobs";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const VALID_ROLES = new Set(["candidate", "recruiter", "admin"]);

function isSafeCandidateNext(next: string): boolean {
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  if (next.includes("..")) return false;
  return next.startsWith("/candidate/");
}

export function AuthRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      await fetch("/api/auth/sync-allowlisted-admin", {
        method: "POST",
        credentials: "same-origin",
      });

      let { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        router.replace("/onboarding/role");
        return;
      }

      const sessionEmail = session.user.email?.trim() ?? "";
      if (
        (!profile?.role || !VALID_ROLES.has(profile.role)) &&
        isAllowedAdminEmail(sessionEmail)
      ) {
        const { data: again } = await supabase
          .from("profiles")
          .select("email, role")
          .eq("id", session.user.id)
          .maybeSingle();
        if (again) profile = again;
      }

      const { data: candidateRow } = await supabase
        .from("candidate_profiles")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      const pendingDraft =
        typeof window !== "undefined" ? loadOnboardingDraft() : null;

      if (pendingDraft) {
        if (!shouldApplyOnboardingDraft(profile, candidateRow?.id)) {
          clearOnboardingDraft();
        } else {
          const body = {
            full_name: pendingDraft.full_name,
            whatsapp: pendingDraft.whatsapp,
            city: pendingDraft.city,
            target_role: pendingDraft.target_role,
            years_experience: pendingDraft.years_experience,
            skills: pendingDraft.skills,
            expected_salary: pendingDraft.expected_salary,
            work_mode: pendingDraft.work_mode,
            cv_url: pendingDraft.cv_url ?? "",
            summary: pendingDraft.summary ?? "",
            industries: pendingDraft.industries ?? "",
          };

          const res = await fetch("/api/candidate/complete-pending-onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
          });

          const json = (await res.json()) as { success?: boolean };
          if (cancelled) return;

          if (res.ok && json.success) {
            clearOnboardingDraft();

            const jobRaw =
              typeof window !== "undefined"
                ? window.localStorage.getItem(POST_LOGIN_REDIRECT_KEY)
                : null;
            const stored = parsePostLoginRedirectPayload(jobRaw);

            if (
              stored &&
              isSafeJobsPostLoginPath(stored.path) &&
              pathReferencesJobId(stored.path, stored.jobId)
            ) {
              const { data: jobRow } = await supabase
                .from("job_listings")
                .select("id")
                .eq("id", stored.jobId)
                .maybeSingle();

              if (cancelled) return;

              clearPostLoginRedirect();
              if (jobRow?.id) {
                router.replace(stored.path);
                return;
              }
              markShowFirstJobsAfterOnboarding();
              router.replace("/candidate/first-jobs");
              return;
            }

            if (jobRaw) clearPostLoginRedirect();
            markShowFirstJobsAfterOnboarding();
            router.replace("/candidate/first-jobs");
            return;
          }

          router.replace("/onboarding?error=guardar");
          return;
        }
      }

      if (!profile?.role || !VALID_ROLES.has(profile.role)) {
        router.replace("/onboarding/role");
        return;
      }

      const role = profile.role as string;

      if (role === "admin") {
        clearPostLoginRedirect();
        const email = session.user.email ?? profile.email;
        router.replace(isAllowedAdminEmail(email) ? "/admin/dashboard" : "/");
        return;
      }

      if (role === "recruiter") {
        clearPostLoginRedirect();
        router.replace("/recruiter/dashboard");
        return;
      }

      if (role !== "candidate") {
        router.replace("/onboarding/role");
        return;
      }

      if (!candidateRow?.id) {
        router.replace("/onboarding/candidate");
        return;
      }

      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(POST_LOGIN_REDIRECT_KEY)
          : null;
      const stored = parsePostLoginRedirectPayload(raw);

      if (
        stored &&
        isSafeJobsPostLoginPath(stored.path) &&
        pathReferencesJobId(stored.path, stored.jobId)
      ) {
        const { data: jobRow } = await supabase
          .from("job_listings")
          .select("id")
          .eq("id", stored.jobId)
          .maybeSingle();

        if (cancelled) return;

        clearPostLoginRedirect();
        if (jobRow?.id) {
          router.replace(stored.path);
          return;
        }
        router.replace("/candidate/jobs");
        return;
      }

      if (raw) {
        clearPostLoginRedirect();
      }

      const nextRaw = searchParams.get("next")?.trim();
      if (nextRaw && isSafeCandidateNext(nextRaw)) {
        router.replace(nextRaw);
        return;
      }

      router.replace("/candidate/dashboard");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return <LoadingState />;
}
