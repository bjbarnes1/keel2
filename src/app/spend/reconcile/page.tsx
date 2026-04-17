import { ReconcileRow } from "@/components/keel/reconcile-row";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import {
  getBudgetCommitmentsForTagging,
  getCategoryOptions,
  getSpendReconciliationQueue,
} from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SpendReconcilePage() {
  const [queue, categories, commitments] = await Promise.all([
    getSpendReconciliationQueue(),
    getCategoryOptions(),
    getBudgetCommitmentsForTagging(),
  ]);

  return (
    <AppShell title="Reconcile" currentPath="/spend" backHref="/spend">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Tag imported rows with a budget category. Optionally link a row to a bill when the description clearly
          matches a commitment.
        </p>
      </SurfaceCard>

      {queue.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">Nothing waiting — you are all caught up.</p>
        </SurfaceCard>
      ) : (
        <div className="space-y-3">
          {queue.map((transaction) => (
            <ReconcileRow
              key={transaction.id}
              transaction={transaction}
              categories={categories}
              commitments={commitments}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
