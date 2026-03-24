"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const PARSING_STAGE_MESSAGES = [
  "Leyendo tu CV…",
  "Detectando experiencia relevante…",
  "Identificando habilidades…",
  "Preparando tu perfil…",
] as const;

export function CvParsingProgressCard({ className }: { className?: string }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % PARSING_STAGE_MESSAGES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 p-6 shadow-sm ring-1 ring-zinc-100",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F172A]/[0.04]"
          aria-hidden
        >
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-[#0F172A]" />
        </div>
        <div className="min-w-0 flex-1">
          <p key={stageIndex} className="stage-line text-sm font-medium tracking-tight text-[#334155]">
            {PARSING_STAGE_MESSAGES[stageIndex]}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Suele tardar menos de un minuto. No cierres esta ventana.
          </p>
          <div
            className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del análisis"
          >
            <div className="parse-bar h-full w-1/3 rounded-full bg-[#0F172A]/20" />
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes cv-parse-bar-move {
          0% {
            transform: translateX(-100%);
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(300%);
            opacity: 0.5;
          }
        }
        @keyframes cv-parse-fade {
          from {
            opacity: 0.35;
          }
          to {
            opacity: 1;
          }
        }
        .parse-bar {
          animation: cv-parse-bar-move 2.4s ease-in-out infinite;
        }
        .stage-line {
          animation: cv-parse-fade 0.45s ease-out;
        }
      `}</style>
    </div>
  );
}
