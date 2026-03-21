import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardErrorKind = "config" | "database";

/** When metrics loading fails, `query` identifies which step broke (for API JSON). */
export type DashboardLoadFailure = {
  ok: false;
  kind: DashboardErrorKind;
  message: string;
  query?: string;
};

export type DashboardMetrics = {
  kpis: {
    usersRegistered: number;
    onboardingCompleted: number;
    jobViewsTotal: number | null;
    jobViewsAvailable: boolean;
    applicationsSaved: number;
    applicationsApplied: number;
    recruiterJobsCreated: number;
  };
  funnel: {
    registered: number;
    onboardingComplete: number;
    viewedJobsEvents: number | null;
    savedApplications: number;
    appliedApplications: number;
  };
  distinctJobViewersSample: number | null;
  recentApplied: Array<{
    id: string;
    candidate_email: string | null;
    job_id: string | null;
    title: string | null;
    company_name: string | null;
    created_at: string | null;
  }>;
  recentRecruiterJobs: Array<{
    id: string;
    job_title: string | null;
    company: string | null;
    created_at: string | null;
  }>;
  recentShortlist: Array<{
    candidate_id: string;
    job_id: string;
    status: string | null;
    created_at: string | null;
    candidate_name: string | null;
    job_title: string | null;
  }>;
  insights: {
    avgJobViewsPerViewer: number | null;
    appliedToSavedRatio: number | null;
    topJobsByApplications: Array<{
      job_id: string;
      count: number;
      title: string | null;
      company_name: string | null;
    }>;
  };
  warnings: string[];
};

const RECENT_LIMIT = 8;
const TOP_JOBS_LIMIT = 5;
const DISTINCT_SAMPLE_PAGES = 5;
const DISTINCT_PAGE_SIZE = 1000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asObjectRows<T extends Record<string, unknown>>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is T =>
      row != null && typeof row === "object" && !Array.isArray(row)
  ) as T[];
}

async function countExact(
  supabase: SupabaseClient,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder chain types differ after .select()
  filter?: (q: any) => any
): Promise<{ count: number; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) {
    return { count: 0, error: new Error(error.message) };
  }
  return { count: count ?? 0, error: null };
}

async function estimateDistinctCandidateIdsFromViews(
  supabase: SupabaseClient
): Promise<{ size: number; capped: boolean } | null> {
  const seen = new Set<string>();
  let capped = false;
  for (let page = 0; page < DISTINCT_SAMPLE_PAGES; page += 1) {
    const from = page * DISTINCT_PAGE_SIZE;
    const to = from + DISTINCT_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("candidate_job_views")
      .select("candidate_id")
      .range(from, to);
    if (error) return null;
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = row.candidate_id;
      if (id != null && String(id)) seen.add(String(id));
    }
    if (rows.length < DISTINCT_PAGE_SIZE) break;
    if (page === DISTINCT_SAMPLE_PAGES - 1) capped = true;
  }
  return { size: seen.size, capped };
}

export async function loadAdminDashboardMetrics(): Promise<
  | { ok: true; data: DashboardMetrics }
  | DashboardLoadFailure
> {
  let supabase: SupabaseClient;
  try {
    supabase = await getSupabaseServerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo inicializar el cliente de Supabase.";
    return {
      ok: false,
      kind: "config",
      message,
      query: "getSupabaseServerClient",
    };
  }

  try {
  const warnings: string[] = [];

  console.log("[loadAdminDashboardMetrics] parallel batch: counts + recent rows");
  const [
    registeredRes,
    onboardingRes,
    viewsRes,
    savedRes,
    appliedRes,
    jobsRes,
    recentAppliedRes,
    recentJobsRes,
    appliedRowsForTopRes,
  ] = await Promise.all([
    countExact(supabase, "candidate_profiles"),
    countExact(supabase, "candidate_profiles", (q) =>
      q
        .not("email", "is", null)
        .or("full_name.not.is.null,target_role.not.is.null,years_experience.not.is.null")
    ),
    countExact(supabase, "candidate_job_views"),
    countExact(supabase, "applications", (q) => q.eq("status", "saved")),
    countExact(supabase, "applications", (q) => q.eq("status", "applied")),
    countExact(supabase, "recruiter_jobs"),
    supabase
      .from("applications")
      .select("id, candidate_email, job_id, title, company_name, created_at")
      .eq("status", "applied")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("recruiter_jobs")
      .select("id, job_title, company, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("applications")
      .select("job_id")
      .eq("status", "applied")
      .not("job_id", "is", null)
      .limit(4000),
  ]);
  console.log("[loadAdminDashboardMetrics] parallel batch done");

  if (registeredRes.error) {
    return {
      ok: false,
      kind: "database",
      message: registeredRes.error.message,
      query: "count:candidate_profiles",
    };
  }

  if (onboardingRes.error) {
    warnings.push(`Onboarding: ${onboardingRes.error.message}`);
  }
  if (savedRes.error) {
    return {
      ok: false,
      kind: "database",
      message: savedRes.error.message,
      query: "count:applications(status=saved)",
    };
  }
  if (appliedRes.error) {
    return {
      ok: false,
      kind: "database",
      message: appliedRes.error.message,
      query: "count:applications(status=applied)",
    };
  }
  if (jobsRes.error) {
    return {
      ok: false,
      kind: "database",
      message: jobsRes.error.message,
      query: "count:recruiter_jobs",
    };
  }

  const jobViewsAvailable = !viewsRes.error;
  if (viewsRes.error) {
    warnings.push(
      `Vistas de vacantes no disponibles (${viewsRes.error.message}). KPI omitido.`
    );
  }

  const usersRegistered = registeredRes.count;
  const onboardingCompleted = onboardingRes.error ? 0 : onboardingRes.count;
  const jobViewsTotal = jobViewsAvailable ? viewsRes.count : null;
  const applicationsSaved = savedRes.count;
  const applicationsApplied = appliedRes.count;
  const recruiterJobsCreated = jobsRes.count;

  let distinctSample: { size: number; capped: boolean } | null = null;
  if (jobViewsAvailable) {
    distinctSample = await estimateDistinctCandidateIdsFromViews(supabase);
    if (!distinctSample) {
      warnings.push("No se pudo estimar usuarios únicos con vistas.");
    } else if (distinctSample.capped) {
      warnings.push(
        "Usuarios únicos con vistas: muestra limitada (primeros registros); el promedio es aproximado."
      );
    }
  }

  const distinctViewers = distinctSample?.size ?? null;
  let avgJobViewsPerViewer: number | null = null;
  if (jobViewsTotal != null && distinctViewers != null && distinctViewers > 0) {
    avgJobViewsPerViewer = Math.round((jobViewsTotal / distinctViewers) * 100) / 100;
  }

  const appliedToSavedRatio =
    applicationsSaved > 0
      ? Math.round((applicationsApplied / applicationsSaved) * 1000) / 1000
      : null;

  const recentApplied = asObjectRows<Record<string, unknown>>(
    recentAppliedRes.data
  ).map((row) => ({
    id: String(row.id ?? ""),
    candidate_email: isNonEmptyString(row.candidate_email)
      ? row.candidate_email
      : null,
    job_id: row.job_id != null ? String(row.job_id) : null,
    title: isNonEmptyString(row.title) ? row.title : null,
    company_name: isNonEmptyString(row.company_name) ? row.company_name : null,
    created_at: isNonEmptyString(row.created_at) ? row.created_at : null,
  }));

  if (recentAppliedRes.error) {
    warnings.push(`Actividad postulaciones: ${recentAppliedRes.error.message}`);
  }

  const recentRecruiterJobs = asObjectRows<Record<string, unknown>>(
    recentJobsRes.data
  ).map((row) => ({
    id: String(row.id ?? ""),
    job_title: isNonEmptyString(row.job_title) ? row.job_title : null,
    company: isNonEmptyString(row.company) ? row.company : null,
    created_at: isNonEmptyString(row.created_at) ? row.created_at : null,
  }));

  if (recentJobsRes.error) {
    return {
      ok: false,
      kind: "database",
      message: recentJobsRes.error.message,
      query: "select:recruiter_jobs(recent)",
    };
  }

  const countsByJob = new Map<string, number>();
  if (!appliedRowsForTopRes.error) {
    for (const row of asObjectRows<Record<string, unknown>>(
      appliedRowsForTopRes.data
    )) {
      if (row.job_id == null) continue;
      const id = String(row.job_id);
      countsByJob.set(id, (countsByJob.get(id) ?? 0) + 1);
    }
  } else {
    warnings.push(`Top vacantes: ${appliedRowsForTopRes.error.message}`);
  }

  const topEntries = [...countsByJob.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_JOBS_LIMIT);
  const topJobIds = topEntries.map(([id]) => id);

  let jobsById = new Map<
    string,
    { title: string | null; company_name: string | null }
  >();
  if (topJobIds.length > 0) {
    const { data: listingRows, error: listingsError } = await supabase
      .from("job_listings")
      .select("id, title, company_name")
      .in("id", topJobIds);
    if (listingsError) {
      warnings.push(`Títulos de vacantes: ${listingsError.message}`);
    } else {
      jobsById = new Map(
        asObjectRows<Record<string, unknown>>(listingRows).map((row) => [
          String(row.id ?? ""),
          {
            title: isNonEmptyString(row.title) ? row.title : null,
            company_name: isNonEmptyString(row.company_name)
              ? row.company_name
              : null,
          },
        ])
      );
    }
  }

  const topJobsByApplications = topEntries.map(([job_id, count]) => {
    const meta = jobsById.get(job_id);
    return {
      job_id,
      count,
      title: meta?.title ?? null,
      company_name: meta?.company_name ?? null,
    };
  });

  /** Shortlist: prefer created_at if column exists */
  let shortlistRows: Array<{
    candidate_id: string;
    job_id: string;
    status: string | null;
    created_at: string | null;
  }> = [];
  console.log("[loadAdminDashboardMetrics] recruiter_shortlist (ordered)");
  const orderedShortlist = await supabase
    .from("recruiter_shortlist")
    .select("candidate_id, job_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  if (orderedShortlist.error) {
    const fallback = await supabase
      .from("recruiter_shortlist")
      .select("candidate_id, job_id, status")
      .limit(RECENT_LIMIT);
    if (fallback.error) {
      warnings.push(`Shortlist reciente: ${fallback.error.message}`);
    } else {
      shortlistRows = asObjectRows<Record<string, unknown>>(fallback.data).map(
        (row) => ({
          candidate_id: String(row.candidate_id ?? ""),
          job_id: String(row.job_id ?? ""),
          status: typeof row.status === "string" ? row.status : null,
          created_at: null,
        })
      );
    }
  } else {
    shortlistRows = asObjectRows<Record<string, unknown>>(
      orderedShortlist.data
    ).map((row) => ({
      candidate_id: String(row.candidate_id ?? ""),
      job_id: String(row.job_id ?? ""),
      status: typeof row.status === "string" ? row.status : null,
      created_at: isNonEmptyString(row.created_at) ? row.created_at : null,
    }));
  }

  const shortlistCandidateIds = Array.from(
    new Set(shortlistRows.map((r) => r.candidate_id).filter(Boolean))
  );
  const shortlistJobIds = Array.from(new Set(shortlistRows.map((r) => r.job_id).filter(Boolean)));

  console.log("[loadAdminDashboardMetrics] shortlist lookups: profiles + recruiter_jobs");
  const [candidatesLookup, jobsLookup] = await Promise.all([
    shortlistCandidateIds.length > 0
      ? supabase
          .from("candidate_profiles")
          .select("id, full_name, email")
          .in("id", shortlistCandidateIds)
      : Promise.resolve({ data: [], error: null as null }),
    shortlistJobIds.length > 0
      ? supabase
          .from("recruiter_jobs")
          .select("id, job_title")
          .in("id", shortlistJobIds)
      : Promise.resolve({ data: [], error: null as null }),
  ]);
  console.log("[loadAdminDashboardMetrics] shortlist lookups done");

  const nameByCandidate = new Map<string, string>();
  for (const row of asObjectRows<Record<string, unknown>>(
    candidatesLookup.data
  )) {
    const id = String(row.id ?? "");
    const name =
      isNonEmptyString(row.full_name) ? row.full_name.trim() : isNonEmptyString(row.email) ? row.email.trim() : null;
    if (name) nameByCandidate.set(id, name);
  }
  const titleByJob = new Map<string, string>();
  for (const row of asObjectRows<Record<string, unknown>>(jobsLookup.data)) {
    const id = String(row.id ?? "");
    if (isNonEmptyString(row.job_title)) titleByJob.set(id, row.job_title.trim());
  }

  const recentShortlist = shortlistRows.map((row) => ({
    ...row,
    candidate_name: nameByCandidate.get(row.candidate_id) ?? null,
    job_title: titleByJob.get(row.job_id) ?? null,
  }));

  const data: DashboardMetrics = {
    kpis: {
      usersRegistered,
      onboardingCompleted,
      jobViewsTotal,
      jobViewsAvailable,
      applicationsSaved,
      applicationsApplied,
      recruiterJobsCreated,
    },
    funnel: {
      registered: usersRegistered,
      onboardingComplete: onboardingCompleted,
      viewedJobsEvents: jobViewsTotal,
      savedApplications: applicationsSaved,
      appliedApplications: applicationsApplied,
    },
    distinctJobViewersSample: distinctViewers,
    recentApplied,
    recentRecruiterJobs,
    recentShortlist,
    insights: {
      avgJobViewsPerViewer,
      appliedToSavedRatio,
      topJobsByApplications,
    },
    warnings,
  };

  return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[loadAdminDashboardMetrics] unexpected throw", {
      message,
      stack,
    });
    return {
      ok: false,
      kind: "database",
      message,
      query: "loadAdminDashboardMetrics",
    };
  }
}

export type AdminDashboardLoadResult = Awaited<
  ReturnType<typeof loadAdminDashboardMetrics>
>;
