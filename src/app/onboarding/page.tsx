/**
 * First-run onboarding shell (`OnboardingFlow` client wizard).
 *
 * @module app/onboarding/page
 */

import { OnboardingFlow } from "@/components/keel/onboarding-flow";
import { AppShell } from "@/components/keel/primitives";

export default function OnboardingPage() {
  return (
    <AppShell title="Onboarding" currentPath="/" backHref="/">
      <OnboardingFlow />
    </AppShell>
  );
}
