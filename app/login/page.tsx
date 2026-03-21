import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

function LoginFallback() {
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <p className="text-sm text-zinc-600">Cargando…</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
