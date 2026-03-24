import { Suspense } from "react";
import { PublicJobsExplorer } from "@/components/jobs/PublicJobsExplorer";
import { LoadingState } from "@/components/shared/LoadingState";
import type { PublicJobRow } from "@/lib/jobs/publicJob";
import { PUBLIC_JOB_SELECT } from "@/lib/jobs/publicJob";
import { getPublicSupabaseServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

export default async function PublicJobsPage() {
  let jobs: PublicJobRow[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getPublicSupabaseServerClient();
    const { data, error } = await supabase
      .from("job_listings")
      .select(PUBLIC_JOB_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[public/jobs] list error", error.message);
      loadError = error.message;
    } else {
      jobs = (data ?? []) as PublicJobRow[];
    }
  } catch (e) {
    console.error("[public/jobs] unexpected", e);
    loadError = "No se pudieron cargar las vacantes.";
  }

  return (
    <main className="ds-page min-h-[calc(100vh-4rem)]">
      <Suspense fallback={<LoadingState />}>
        <PublicJobsExplorer initialJobs={jobs} loadError={loadError} />
      </Suspense>
    </main>
  );
}
