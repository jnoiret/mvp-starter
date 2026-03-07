import type { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  className?: string;
};

export function Section({ children, className }: SectionProps) {
  return (
    <section
      className={`mx-auto w-full max-w-4xl px-6 py-8 sm:py-10 ${
        className ?? ""
      }`}
    >
      {children}
    </section>
  );
}

