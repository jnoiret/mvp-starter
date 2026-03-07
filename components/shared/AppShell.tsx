import type { ReactNode } from "react";
import { AppNav } from "@/components/shared/AppNav";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="py-10">{children}</main>
    </div>
  );
}

