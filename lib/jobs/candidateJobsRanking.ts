/**
 * Lógica compartida de ranking de vacantes (lista candidato y /jobs autenticado).
 */

export type JobListingRow = {
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

export type CandidateMatchProfile = {
  id: string;
  email: string | null;
  target_role: string | null;
  work_mode: string | null;
  skills: string | null;
  city: string | null;
  expected_salary: number | null;
};

export type ApplicationStatusMap = Record<
  string,
  {
    saved: boolean;
    applied: boolean;
  }
>;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSkillList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean);
  }
  return value
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
}

function roleMatchesClosely(targetRole: string | null, jobTitle: string | null) {
  if (!targetRole || !jobTitle) return false;
  const role = normalize(targetRole);
  const title = normalize(jobTitle);
  if (!role || !title) return false;

  if (role === title || role.includes(title) || title.includes(role)) return true;

  const roleTokens = role.split(" ").filter(Boolean);
  const titleTokens = title.split(" ").filter(Boolean);
  if (roleTokens.length === 0 || titleTokens.length === 0) return false;

  const overlap = roleTokens.filter((token) => titleTokens.includes(token)).length;
  const ratio = overlap / Math.max(roleTokens.length, titleTokens.length);
  return ratio >= 0.6;
}

function parseSalaryRange(salaryRange: string | null) {
  if (!salaryRange) return null;
  const numbers = salaryRange
    .replace(/\./g, "")
    .match(/\d+(?:,\d+)?/g)
    ?.map((n) => Number(n.replace(",", ".")));

  if (!numbers || numbers.length === 0) return null;
  if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

function isRemote(workMode: string | null) {
  if (!workMode) return false;
  const mode = normalize(workMode);
  return mode.includes("remoto") || mode.includes("remote");
}

export function calculateMatchScore(
  job: JobListingRow,
  candidate: CandidateMatchProfile | null,
) {
  if (!candidate) return 0;

  let score = 0;

  if (roleMatchesClosely(candidate.target_role, job.title)) {
    score += 1;
  }

  const candidateSkills = toSkillList(candidate.skills);
  const requiredSkills = toSkillList(job.required_skills);
  if (candidateSkills.length > 0 && requiredSkills.length > 0) {
    const sharedCount = requiredSkills.filter((skill) =>
      candidateSkills.includes(skill),
    ).length;
    if (sharedCount >= 2) score += 2;
    else if (sharedCount >= 1) score += 1;
  }

  if (
    candidate.work_mode &&
    job.work_mode &&
    normalize(candidate.work_mode) === normalize(job.work_mode)
  ) {
    score += 1;
  }

  if (
    isRemote(job.work_mode) ||
    (candidate.city &&
      job.city &&
      normalize(candidate.city) === normalize(job.city))
  ) {
    score += 1;
  }

  const range = parseSalaryRange(job.salary_range);
  if (
    range &&
    typeof candidate.expected_salary === "number" &&
    candidate.expected_salary >= range.min &&
    candidate.expected_salary <= range.max
  ) {
    score += 1;
  }

  return Math.min(5, Math.max(0, score));
}

function getNormalizedTokens(value: string | null) {
  if (!value) return [];
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getOverlapRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(left.length, right.length);
}

function calculateJobSimilarity(source: JobListingRow, target: JobListingRow) {
  const roleSimilarity = roleMatchesClosely(source.title, target.title)
    ? 1
    : getOverlapRatio(getNormalizedTokens(source.title), getNormalizedTokens(target.title));

  const skillSimilarity = getOverlapRatio(
    toSkillList(source.required_skills),
    toSkillList(target.required_skills),
  );

  const sameWorkMode =
    source.work_mode && target.work_mode
      ? normalize(source.work_mode) === normalize(target.work_mode)
      : false;
  const sameCity =
    source.city && target.city ? normalize(source.city) === normalize(target.city) : false;
  const bothRemote = isRemote(source.work_mode) && isRemote(target.work_mode);
  const locationModeSimilarity =
    sameWorkMode || sameCity || bothRemote || isRemote(source.work_mode) || isRemote(target.work_mode)
      ? 1
      : 0;

  return roleSimilarity * 0.45 + skillSimilarity * 0.35 + locationModeSimilarity * 0.2;
}

function getAverageSimilarity(job: JobListingRow, anchors: JobListingRow[]) {
  if (anchors.length === 0) return 0;
  const total = anchors.reduce(
    (sum, anchor) => sum + calculateJobSimilarity(job, anchor),
    0,
  );
  return total / anchors.length;
}

export type BehaviorRankingContext = {
  savedAnchors: JobListingRow[];
  appliedAnchors: JobListingRow[];
  hiddenAnchors: JobListingRow[];
  viewedAnchors: JobListingRow[];
};

function getBehaviorAdjustment(job: JobListingRow, context: BehaviorRankingContext) {
  const savedSimilarity = getAverageSimilarity(job, context.savedAnchors);
  const appliedSimilarity = getAverageSimilarity(job, context.appliedAnchors);
  const hiddenSimilarity = getAverageSimilarity(job, context.hiddenAnchors);
  const viewedSimilarity = getAverageSimilarity(job, context.viewedAnchors);

  return (
    appliedSimilarity * 20 +
    savedSimilarity * 12 +
    viewedSimilarity * 3 -
    hiddenSimilarity * 8
  );
}

export function computeBehaviorRankingContext(
  jobs: JobListingRow[],
  applicationStatusByJob: ApplicationStatusMap,
  hiddenJobIds: Set<string>,
  viewedJobIds: Set<string>,
): BehaviorRankingContext {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const savedAnchors: JobListingRow[] = [];
  const appliedAnchors: JobListingRow[] = [];
  const hiddenAnchors: JobListingRow[] = [];
  const viewedAnchors: JobListingRow[] = [];

  Object.entries(applicationStatusByJob).forEach(([jobId, state]) => {
    const linkedJob = jobsById.get(jobId);
    if (!linkedJob) return;
    if (state.applied) {
      appliedAnchors.push(linkedJob);
    } else if (state.saved) {
      savedAnchors.push(linkedJob);
    }
  });

  hiddenJobIds.forEach((jobId) => {
    const linkedJob = jobsById.get(jobId);
    if (linkedJob) hiddenAnchors.push(linkedJob);
  });

  viewedJobIds.forEach((jobId) => {
    const linkedJob = jobsById.get(jobId);
    if (linkedJob) viewedAnchors.push(linkedJob);
  });

  return { savedAnchors, appliedAnchors, hiddenAnchors, viewedAnchors };
}

export function orderJobsWithCandidateRanking(
  jobs: JobListingRow[],
  candidate: CandidateMatchProfile | null,
  hiddenJobIds: Set<string>,
  applicationStatusByJob: ApplicationStatusMap,
  viewedJobIds: Set<string>,
): JobListingRow[] {
  const behaviorRankingContext = computeBehaviorRankingContext(
    jobs,
    applicationStatusByJob,
    hiddenJobIds,
    viewedJobIds,
  );

  const ranking = jobs
    .filter((job) => !hiddenJobIds.has(job.id))
    .map((job) => {
      const matchScore = calculateMatchScore(job, candidate);
      const behaviorAdjustment = getBehaviorAdjustment(job, behaviorRankingContext);
      const compositeScore = matchScore * 100 + behaviorAdjustment;
      const createdAtTime = job.created_at ? new Date(job.created_at).getTime() : 0;
      return {
        job,
        compositeScore,
        createdAtTime: Number.isNaN(createdAtTime) ? 0 : createdAtTime,
      };
    });

  ranking.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    return b.createdAtTime - a.createdAtTime;
  });

  return ranking.map((item) => item.job);
}

/** Lista completa: solo fecha de publicación (más recientes primero). */
export function orderJobsChronological(
  jobs: JobListingRow[],
  hiddenJobIds: Set<string>,
): JobListingRow[] {
  return [...jobs]
    .filter((job) => !hiddenJobIds.has(job.id))
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
}

export function getPostedAgeLabel(createdAt: string | null) {
  if (!createdAt) return null;
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return null;
  const diffMs = Date.now() - createdTime;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "Hoy";
  if (days === 1) return "1 d";
  return `${days} d`;
}
