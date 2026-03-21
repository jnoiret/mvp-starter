type ExecutiveSummaryProps = {
  job: Record<string, unknown> | null;
  candidate: Record<string, unknown> | null;
  matchScore: number;
};

function getSummaryMessage(matchScore: number) {
  if (matchScore >= 4) {
    return "You appear to be a strong match for this role based on your profile.";
  }
  if (matchScore === 3) {
    return "You could be a potential match for this role, but some requirements may be missing.";
  }
  return "This role may require skills or experience not strongly present in your profile.";
}

export default function ExecutiveSummary({
  job,
  candidate,
  matchScore,
}: ExecutiveSummaryProps) {
  // Keep the props explicit for upcoming real logic.
  void job;
  void candidate;

  const strengths = ["Product Strategy", "Growth", "Leadership"];
  const potentialGaps = ["SQL", "Data modeling"];

  return (
    <section className="space-y-4 rounded-xl border bg-white p-6">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">Executive Summary</h2>
        <p className="text-sm leading-relaxed text-gray-600">
          {getSummaryMessage(matchScore)}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Strengths</h3>
        <div className="flex flex-wrap gap-2">
          {strengths.map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs text-green-700"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Potential gaps</h3>
        <div className="flex flex-wrap gap-2">
          {potentialGaps.map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs text-red-700"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
