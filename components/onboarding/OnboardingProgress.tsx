type OnboardingProgressProps = {
  step: number;
  totalSteps?: number;
  label?: string;
};

export function OnboardingProgress({
  step,
  totalSteps = 5,
  label,
}: OnboardingProgressProps) {
  const safeStep = Math.min(Math.max(step, 1), totalSteps);
  const pct = Math.round((safeStep / totalSteps) * 100);

  return (
    <div className="mb-8 flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
        <span>
          Paso {safeStep} de {totalSteps}
          {label ? ` · ${label}` : ""}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="ds-accent-gradient h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
