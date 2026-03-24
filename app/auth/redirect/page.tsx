import { Suspense } from "react";
import { AuthRedirectClient } from "./AuthRedirectClient";
import { LoadingState } from "@/components/shared/LoadingState";

export const dynamic = "force-dynamic";

export default function AuthRedirectPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AuthRedirectClient />
    </Suspense>
  );
}
