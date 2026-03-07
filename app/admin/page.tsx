"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/features/admin/AdminShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  message: string | null;
  created_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

export default function AdminPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLeads() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();

        const { data, error } = await supabase
          .from("leads")
          .select("id, name, email, message, created_at")
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error) {
          console.error("Supabase fetch leads error:", error);
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }

        setLeads(data ?? []);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        console.error("Unexpected error loading leads:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Unexpected error while loading leads."
        );
      }
    }

    loadLeads();

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
        title="Could not load leads"
        description={errorMessage ?? "An unknown error occurred."}
      />
    );
  } else if (leads.length === 0) {
    content = (
      <EmptyState
        title="No leads yet"
        description="When someone submits the test form, new leads will appear here."
      />
    );
  } else {
    content = (
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-t border-zinc-100 text-zinc-800 dark:border-zinc-800 dark:text-zinc-100"
              >
                <td className="px-4 py-3 align-top">
                  {lead.name ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {lead.email ?? <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {lead.message ?? (
                    <span className="text-zinc-400">No message</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {new Date(lead.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <AdminShell title="Leads">{content}</AdminShell>;
}

