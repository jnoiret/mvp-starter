export type ApplicationStatus = "saved" | "applied";

export type JobApplicationState = {
  saved: boolean;
  applied: boolean;
};

export function normalizeApplicationStatus(
  value: string | null | undefined
): ApplicationStatus | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === "saved" || lower === "applied") return lower;
  return null;
}

export function deriveJobApplicationStateMap(
  rows: Array<{ job_id: string | null; status: string | null }>
): Record<string, JobApplicationState> {
  const map: Record<string, JobApplicationState> = {};
  for (const row of rows) {
    const jobId = String(row.job_id ?? "");
    const status = normalizeApplicationStatus(row.status);
    if (!jobId || !status) continue;
    if (!map[jobId]) map[jobId] = { saved: false, applied: false };
    if (status === "saved") map[jobId].saved = true;
    if (status === "applied") map[jobId].applied = true;
  }
  return map;
}

export function getEffectiveStatus(
  state: JobApplicationState
): ApplicationStatus | null {
  if (state.applied) return "applied";
  if (state.saved) return "saved";
  return null;
}

export function formatApplicationStatusLabel(status: ApplicationStatus) {
  return status === "saved" ? "Guardada" : "Postulada";
}

