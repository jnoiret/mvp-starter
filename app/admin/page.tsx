"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/features/admin/AdminShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type CandidateProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  target_role: string | null;
  years_experience: number | null;
  skills: string | null;
  expected_salary: number | null;
  work_mode: string | null;
  created_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

export default function AdminPage() {
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCandidateProfiles() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();

        const { data, error } = await supabase
          .from("candidate_profiles")
          .select(
            "id, full_name, email, whatsapp, city, target_role, years_experience, skills, expected_salary, work_mode, created_at"
          )
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error) {
          console.error("Supabase fetch candidate_profiles error:", error);
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }

        setProfiles(data ?? []);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        console.error("Unexpected error loading candidate_profiles:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Unexpected error while loading candidate profiles."
        );
      }
    }

    loadCandidateProfiles();

    return () => {
      isMounted = false;
    };
  }, []);

  let content: React.ReactNode = null;

  if (status === "loading" || status === "idle") {
    content = <LoadingState />;
  } else if (status === "error") {
    content = (
      <EmptyState
        title="Could not load candidate profiles"
        description={errorMessage ?? "An unknown error occurred."}
      />
    );
  } else if (profiles.length === 0) {
    content = (
      <EmptyState
        title="No candidate profiles yet"
        description="When someone completes onboarding, new candidate profiles will appear here."
      />
    );
  } else {
    content = (
      <div className="ds-card overflow-x-auto rounded-lg text-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-[#475569]">
              <th className="px-4 py-3">Full name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Target role</th>
              <th className="px-4 py-3">Years exp.</th>
              <th className="px-4 py-3">Skills</th>
              <th className="px-4 py-3">Expected salary</th>
              <th className="px-4 py-3">Work mode</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr
                key={profile.id}
                className="border-t border-zinc-100 text-[#0F172A]"
              >
                <td className="px-4 py-3 align-top">
                  {profile.full_name ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.email ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.whatsapp ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.city ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.target_role ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.years_experience ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="max-w-[360px] whitespace-pre-wrap text-[#0F172A]">
                    {profile.skills ?? <span className="text-zinc-400">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.expected_salary ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {profile.work_mode ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top text-sm text-[#475569]">
                  {new Date(profile.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminShell
      title="Candidate profiles"
      action={
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] shadow-sm hover:border-[#94A3B8] hover:bg-[#F8FAFF]"
        >
          Dashboard de producto
        </Link>
      }
    >
      {content}
    </AdminShell>
  );
}

