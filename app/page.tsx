import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <section className="flex items-center justify-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-2xl text-center sm:text-left">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Build and launch your MVP faster.
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          A minimal Next.js starter focused on clarity, speed, and just the
          essentials you need to ship.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/admin">
            <Button>Get started</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
