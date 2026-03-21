import { Suspense } from "react";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md px-6 py-12">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
