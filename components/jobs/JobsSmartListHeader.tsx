"use client";

export type JobsListSortMode = "prioritized" | "all";

type JobsSmartListHeaderProps = {
  mode: JobsListSortMode;
  onModeChange: (mode: JobsListSortMode) => void;
};

export function JobsSmartListHeader({ mode, onModeChange }: JobsSmartListHeaderProps) {
  const isPrioritized = mode === "prioritized";

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/40 px-4 py-4 shadow-sm sm:px-5 sm:py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-[#0F172A] sm:text-lg">
            {isPrioritized ? "Modo inteligente activado" : "Todas las vacantes"}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[#64748B] sm:text-[13px]">
            {isPrioritized
              ? "Estamos priorizando vacantes donde tienes mayor probabilidad de avanzar"
              : "Orden por fecha de publicación, las más recientes primero."}
          </p>
        </div>
        <div
          className="flex shrink-0 rounded-full border border-zinc-200/90 bg-white p-1 shadow-inner"
          role="group"
          aria-label="Vista de lista"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isPrioritized}
            onClick={() => onModeChange("prioritized")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
              isPrioritized
                ? "bg-[#0F172A] text-white shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            Priorizadas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isPrioritized}
            onClick={() => onModeChange("all")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
              !isPrioritized
                ? "bg-[#0F172A] text-white shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            Todas
          </button>
        </div>
      </div>
    </div>
  );
}
