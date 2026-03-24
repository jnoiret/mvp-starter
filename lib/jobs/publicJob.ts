export type PublicJobRow = {
  id: string;
  title: string | null;
  company_name: string | null;
  city: string | null;
  work_mode: string | null;
  salary_range: string | null;
  description: string | null;
  required_skills: string | string[] | null;
  created_at: string | null;
};

export const PUBLIC_JOB_SELECT =
  "id, title, company_name, city, work_mode, salary_range, description, required_skills, created_at";

export function truncateText(text: string | null | undefined, maxLen: number): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

export function formatLocationLine(
  city: string | null,
  workMode: string | null,
): string | null {
  const c = city?.trim() || "";
  const w = workMode?.trim() || "";
  const lower = w.toLowerCase();
  if (lower.includes("remoto") || lower.includes("remote")) {
    return c ? `${c} · Remoto` : "Remoto";
  }
  if (c && w) return `${c} · ${w}`;
  if (c) return c;
  if (w) return w;
  return null;
}

export function skillsTeaser(skills: string | string[] | null | undefined): string | null {
  if (!skills) return null;
  const list = Array.isArray(skills)
    ? skills
    : String(skills)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  if (list.length === 0) return null;
  const shown = list.slice(0, 4).join(" · ");
  return list.length > 4 ? `${shown}…` : shown;
}
