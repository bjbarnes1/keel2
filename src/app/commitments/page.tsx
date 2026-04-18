import { annualizeAmount } from "@/lib/engine/keel";
import {
  getCommitmentSkipPreviewBundle,
  getDashboardSnapshot,
} from "@/lib/persistence/keel-store";

import { CommitmentsBrowseClient } from "@/components/keel/commitments-browse-client";
import { AppShell } from "@/components/keel/primitives";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const snapshot = await getDashboardSnapshot();
  const skipPreview = await getCommitmentSkipPreviewBundle(snapshot);
  const goals = snapshot.goals.map((goal) => ({ id: goal.id, name: goal.name }));
  const summaryAnnualized = snapshot.commitments.reduce(
    (sum, c) => sum + annualizeAmount(c.amount, c.frequency),
    0,
  );

  return (
    <AppShell title="Commitments" currentPath="/commitments">
      <CommitmentsBrowseClient
        commitments={snapshot.commitments}
        goals={goals}
        skipPreview={skipPreview}
        summaryReserved={snapshot.totalReserved}
        summaryAnnualized={summaryAnnualized}
      />
    </AppShell>
  );
}
