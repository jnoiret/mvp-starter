import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppNav } from "@/components/shared/AppNav";

type AppShellProps = {
  children: ReactNode;
};

function NavFallback() {
  return (
    <header className="h-14 border-b border-zinc-100 bg-white/80 backdrop-blur-sm" />
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFF]">
      <Suspense fallback={<NavFallback />}>
        <AppNav />
      </Suspense>
      <main className="py-10">{children}</main>
    </div>
  );
}
