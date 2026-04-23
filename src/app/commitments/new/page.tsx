/**
 * Add commitment — AI-assisted intake flow (`CommitmentIntakeFlow`).
 *
 * @module app/commitments/new/page
 */

import { CommitmentIntakeFlow } from "@/components/keel/commitment-intake-flow";
import { AppShell } from "@/components/keel/primitives";
import { getCategoryOptions, getDashboardSnapshot } from "@/lib/persistence/keel-store";

export default async function NewCommitmentPage() {
  const snapshot = await getDashboardSnapshot();
  const categories = await getCategoryOptions();

  return (
    <AppShell title="Add a commitment" currentPath="/commitments" backHref="/commitments">
      <CommitmentIntakeFlow
        incomes={snapshot.incomes}
        primaryIncomeId={snapshot.primaryIncomeId}
        categories={categories}
      />
    </AppShell>
  );
}
