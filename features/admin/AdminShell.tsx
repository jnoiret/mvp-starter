import type { ReactNode } from "react";
import { Section } from "@/components/shared/Section";
import { PageHeader } from "@/components/shared/PageHeader";

type AdminShellProps = {
  title: string;
  children: ReactNode;
};

export function AdminShell({ title, children }: AdminShellProps) {
  return (
    <Section className="flex flex-col gap-8">
      <PageHeader
        title={title}
        description="A simple admin area for managing your future SaaS."
      />
      <section>{children}</section>
    </Section>
  );
}

