type WhyRecommendedProps = {
  matchScore: number;
  job: unknown;
  candidate: unknown;
};

const FALLBACK_STRONG_SIGNALS = ["Comunicación", "Colaboración"];
const FALLBACK_LEARNING = ["Métricas de producto", "Investigación de usuarios"];

function toSkillList(value: unknown): string[] {
  if (!value) return [];
  const rawItems: string[] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[,\n;|/]/g)
      : [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of rawItems) {
    const cleaned = item.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }
  return normalized;
}

function normalizeSkillKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function formatSkillLabel(skill: string) {
  const lower = normalizeSkillKey(skill);
  const dictionary: Record<string, string> = {
    "ux design": "Diseño UX",
    "ui design": "Diseño UI",
    "user research": "Investigación de usuarios",
    "product metrics": "Métricas de producto",
    "design systems": "Design Systems",
    sql: "SQL",
  };
  if (dictionary[lower]) return dictionary[lower];

  return skill
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return null;
  return (obj as Record<string, unknown>)[key];
}

function getStringValue(obj: unknown, key: string): string | null {
  const value = getValue(obj, key);
  return typeof value === "string" ? value : null;
}

function getNumberValue(obj: unknown, key: string): number | null {
  const value = getValue(obj, key);
  return typeof value === "number" ? value : null;
}

function getNumberLikeValue(obj: unknown, key: string): number | null {
  const raw = getValue(obj, key);
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return null;
  const parsed = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getJobSkills(job: unknown): string[] {
  return toSkillList(getValue(job, "required_skills") ?? getValue(job, "skills"));
}

function getCandidateSkills(candidate: unknown): string[] {
  return toSkillList(getValue(candidate, "skills"));
}

function getSkillPriority(skill: string) {
  const lower = skill.toLowerCase();
  if (
    lower.includes("ux") ||
    lower.includes("ui") ||
    lower.includes("figma") ||
    lower.includes("design")
  ) {
    return 4;
  }
  if (
    lower.includes("product") ||
    lower.includes("growth") ||
    lower.includes("strategy") ||
    lower.includes("lead")
  ) {
    return 3;
  }
  if (
    lower.includes("react") ||
    lower.includes("typescript") ||
    lower.includes("frontend") ||
    lower.includes("backend")
  ) {
    return 2;
  }
  return 1;
}

function getTokenOverlapRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(left.length, right.length);
}

function looksPartiallyMatched(jobSkill: string, candidateSkills: string[]) {
  const jobTokens = toTokens(jobSkill);
  if (jobTokens.length === 0) return false;

  return candidateSkills.some((candidateSkill) => {
    const ratio = getTokenOverlapRatio(jobTokens, toTokens(candidateSkill));
    return ratio >= 0.34 && ratio < 1;
  });
}

function roleSeemsAligned(candidateRole: string | null, jobTitle: string | null) {
  if (!candidateRole || !jobTitle) return false;
  const role = normalizeText(candidateRole);
  const title = normalizeText(jobTitle);
  if (!role || !title) return false;
  return role.includes(title) || title.includes(role);
}

function isRemote(workMode: string | null) {
  const normalized = normalizeText(workMode);
  return normalized.includes("remoto") || normalized.includes("remote");
}

function getSeniorityLabel(text: string | null) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (normalized.includes("director")) return "Director";
  if (normalized.includes("head")) return "Head";
  if (normalized.includes("lead")) return "Lead";
  if (normalized.includes("senior") || normalized.includes("sr")) return "Senior";
  if (normalized.includes("mid") || normalized.includes("semi")) return "Mid";
  if (normalized.includes("junior") || normalized.includes("jr")) return "Junior";
  if (normalized.includes("intern") || normalized.includes("practicante")) return "Intern";
  return null;
}

function getExpectedSeniorityFromYears(years: number | null) {
  if (typeof years !== "number") return null;
  if (years >= 8) return "Senior";
  if (years >= 3) return "Mid";
  return "Junior";
}

function uniqueList(items: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizeSkillKey(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function parseSalaryRange(salaryRange: string | null) {
  if (!salaryRange) return null;
  const numbers = salaryRange
    .replace(/\./g, "")
    .match(/\d+(?:,\d+)?/g)
    ?.map((n) => Number(n.replace(",", ".")));
  if (!numbers || numbers.length === 0) return null;
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  const sorted = [...numbers].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

type TrafficAnalysis = {
  strongMatches: string[];
  partialMatches: string[];
  noMatches: string[];
  learnItems: string[];
};

function deriveTrafficAnalysis(job: unknown, candidate: unknown): TrafficAnalysis {
  const jobSkills = uniqueList(getJobSkills(job), 12);
  const candidateSkills = getCandidateSkills(candidate);
  const candidateSkillKeys = new Set(candidateSkills.map(normalizeSkillKey));

  if (jobSkills.length === 0) {
    return {
      strongMatches: FALLBACK_STRONG_SIGNALS.map((skill) => `Coincidencia clara en ${skill}`),
      partialMatches: [],
      noMatches: [],
      learnItems: FALLBACK_LEARNING.slice(0, 4),
    };
  }

  const alignedSkills = jobSkills
    .filter((skill) => candidateSkillKeys.has(normalizeSkillKey(skill)))
    .sort((a, b) => getSkillPriority(b) - getSkillPriority(a))
    .map(formatSkillLabel)
    .slice(0, 4);
  const strongMatches = alignedSkills.map((skill) => `Coincidencia clara en ${skill}`);
  const strongKeys = new Set(alignedSkills.map(normalizeSkillKey));

  const missingSkills = jobSkills.filter(
    (skill) => !candidateSkillKeys.has(normalizeSkillKey(skill))
  );
  const partialSkills = missingSkills
    .filter((skill) => looksPartiallyMatched(skill, candidateSkills))
    .sort((a, b) => getSkillPriority(b) - getSkillPriority(a))
    .map(formatSkillLabel)
    .filter((skill) => !strongKeys.has(normalizeSkillKey(skill)))
    .slice(0, 4);
  const partialKeys = new Set(partialSkills.map(normalizeSkillKey));

  const majorGapSkills = missingSkills
    .sort((a, b) => getSkillPriority(b) - getSkillPriority(a))
    .map(formatSkillLabel)
    .filter((skill) => {
      const key = normalizeSkillKey(skill);
      return !strongKeys.has(key) && !partialKeys.has(key);
    });

  const candidateRole = getStringValue(candidate, "target_role");
  const candidateYears =
    getNumberValue(candidate, "years_experience") ??
    getNumberLikeValue(candidate, "years_experience");
  const candidateWorkMode = getStringValue(candidate, "work_mode");

  const jobTitle = getStringValue(job, "title");
  const jobWorkMode = getStringValue(job, "work_mode");

  const noMatches = uniqueList(
    [
      !roleSeemsAligned(candidateRole, jobTitle) ? "Objetivo laboral" : "",
      (() => {
        const candidateSeniority = getExpectedSeniorityFromYears(candidateYears);
        const jobSeniority = getSeniorityLabel(jobTitle);
        if (!candidateSeniority || !jobSeniority) return "";
        if (candidateSeniority === jobSeniority) return "";
        return `Seniority (${candidateSeniority} vs ${jobSeniority})`;
      })(),
      majorGapSkills.length >= 2 ? "Brechas clave de habilidades" : "",
      candidateWorkMode &&
      jobWorkMode &&
      !isRemote(jobWorkMode) &&
      normalizeText(candidateWorkMode) !== normalizeText(jobWorkMode)
        ? "Modalidad de trabajo"
        : "",
    ],
    4
  );

  return {
    strongMatches:
      strongMatches.length > 0
        ? strongMatches
        : FALLBACK_STRONG_SIGNALS.map((skill) => `Coincidencia clara en ${skill}`),
    partialMatches: partialSkills.map((skill) => `Match parcial en ${skill}`).slice(0, 4),
    noMatches,
    learnItems: majorGapSkills.slice(0, 4),
  };
}

export default function WhyRecommended({
  matchScore,
  job,
  candidate,
}: WhyRecommendedProps) {
  const analysis = deriveTrafficAnalysis(job, candidate);
  const candidateSalary = getNumberValue(candidate, "expected_salary");
  const jobSalaryRange = getStringValue(job, "salary_range");

  const strongForRender = uniqueList(analysis.strongMatches, 4);
  const strongKeys = new Set(
    strongForRender.map((item) =>
      normalizeSkillKey(item.replace(/^Coincidencia clara en\s*/i, ""))
    )
  );

  const partialForRender = uniqueList(
    analysis.partialMatches.filter((item) => {
      const key = normalizeSkillKey(item.replace(/^Match parcial en\s*/i, ""));
      return !strongKeys.has(key);
    }),
    4
  );

  const noMatchForRender = uniqueList(analysis.noMatches, 4);

  const learnForRender = uniqueList(
    analysis.learnItems.filter((item) => {
      const key = normalizeSkillKey(item);
      const inStrong = strongKeys.has(key);
      const inPartial = partialForRender.some(
        (partial) =>
          normalizeSkillKey(partial.replace(/^Match parcial en\s*/i, "")) === key
      );
      return !inStrong && !inPartial;
    }),
    4
  );

  const salaryMismatch = (() => {
    const range = parseSalaryRange(jobSalaryRange);
    if (!range || typeof candidateSalary !== "number") return "";
    if (candidateSalary < range.min || candidateSalary > range.max) {
      return "Expectativa salarial fuera del rango";
    }
    return "";
  })();

  const noMatchWithSalary =
    salaryMismatch && !noMatchForRender.includes(salaryMismatch)
      ? uniqueList([...noMatchForRender, salaryMismatch], 4)
      : noMatchForRender;

  const hasCriticalMismatch = noMatchWithSalary.some((item) => {
    const normalized = normalizeText(item);
    return (
      normalized.includes("seniority") ||
      normalized.includes("objetivo laboral") ||
      normalized.includes("brechas clave")
    );
  });

  const interviewEstimate = (() => {
    if (matchScore >= 4 && !hasCriticalMismatch && noMatchWithSalary.length <= 1) {
      return {
        level: "Alta",
        description: "Tu perfil parece competitivo para esta vacante.",
        classes: "border-emerald-100 bg-emerald-50 text-emerald-700",
      };
    }
    if (matchScore <= 2 || hasCriticalMismatch) {
      return {
        level: "Baja",
        description: "Tu perfil no parece especialmente fuerte para esta vacante hoy.",
        classes: "border-rose-100 bg-rose-50 text-rose-700",
      };
    }
    return {
      level: "Media",
      description: "Tu perfil podría competir, pero hay algunos puntos a reforzar.",
      classes: "border-amber-100 bg-amber-50 text-amber-700",
    };
  })();

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          Por qué esta vacante es recomendada para ti
        </h2>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-700">
          Probabilidad estimada de entrevista
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${interviewEstimate.classes}`}
          >
            {interviewEstimate.level}
          </span>
        </div>
        <p className="text-sm text-slate-600">{interviewEstimate.description}</p>
      </div>

      {strongForRender.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-emerald-700">En qué sí haces match</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {strongForRender.slice(0, 4).map((item) => (
              <li key={item}>✔ {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {partialForRender.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-700">Match parcial</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {partialForRender.slice(0, 4).map((item) => (
              <li key={item}>◐ {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {noMatchWithSalary.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-rose-700">No haces match</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {noMatchWithSalary.slice(0, 4).map((item) => (
              <li key={item}>✖ {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {learnForRender.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-sky-700">Qué deberías aprender</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {learnForRender.slice(0, 4).map((item) => (
              <li key={item}>→ {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
