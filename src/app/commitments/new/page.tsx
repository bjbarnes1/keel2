/**
 * Add commitment — AI-assisted intake flow (`BillIntakeFlow`).
 *
 * @module app/commitments/new/page
 */

import { BillIntakeFlow } from "@/components/keel/bill-intake-flow";
import { AppShell } from "@/components/keel/primitives";
import { getCategoryOptions, getDashboardSnapshot } from "@/lib/persistence/keel-store";

export default async function NewCommitmentPage() {
  const snapshot = await getDashboardSnapshot();
  const categories = await getCategoryOptions();

  return (
    <AppShell title="Add a commitment" currentPath="/commitments" backHref="/commitments">
      <BillIntakeFlow
        incomes={snapshot.incomes}
        primaryIncomeId={snapshot.primaryIncomeId}
        categories={categories}
      />
    </AppShell>
  );
}
