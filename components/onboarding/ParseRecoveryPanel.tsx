"use client";

type RecoveryKind = "extraction_failed" | "weak";

type Props = {
  kind: RecoveryKind;
  onRetryUpload: () => void;
  onGoPaste: () => void;
  onGoManual: () => void;
};

export function ParseRecoveryPanel({ kind, onRetryUpload, onGoPaste, onGoManual }: Props) {
  const title =
    kind === "extraction_failed"
      ? "No pudimos leer texto de este archivo"
      : "No pudimos completar tu perfil automáticamente";

  const subtitle =
    kind === "extraction_failed"
      ? "Prueba con otro PDF exportado desde Word, un DOCX, o usa las opciones de abajo."
      : "Aún así puedes seguir con una de estas opciones:";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-4 text-sm text-amber-950">
        <p className="font-semibold text-amber-950">{title}</p>
        <p className="mt-2 leading-relaxed text-amber-900/90">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onRetryUpload}
          className="rounded-xl bg-[#0F172A] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-900 sm:min-w-[11rem]"
        >
          Intentar de nuevo
        </button>
        <button
          type="button"
          onClick={onGoPaste}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-[#334155] shadow-sm transition hover:bg-zinc-50 sm:min-w-[11rem]"
        >
          Pegar texto del CV
        </button>
        <button
          type="button"
          onClick={onGoManual}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 sm:min-w-[11rem]"
        >
          Llenar manual
        </button>
      </div>
    </div>
  );
}
