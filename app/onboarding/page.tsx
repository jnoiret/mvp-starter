import { Suspense } from "react";
import { CandidateQuickOnboarding } from "@/components/onboarding/CandidateQuickOnboarding";
import { LoadingState } from "@/components/shared/LoadingState";

export const dynamic = "force-dynamic";

export default function PublicOnboardingPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CandidateQuickOnboarding variant="public" defaultEmail="" defaultName="" />
    </Suspense>
  );
}
