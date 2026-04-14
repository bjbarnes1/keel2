import {
  AddCardLink,
  AppShell,
  CommitmentCard,
} from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell title="Bills" currentPath="/bills">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total reserved right now</p>
          <p className="mt-2 text-xs text-muted-foreground">
            across {snapshot.commitments.length} commitments
          </p>
        </div>
        <p className="font-mono text-2xl font-bold text-amber-500">
          {formatAud(snapshot.totalReserved)}
        </p>
      </div>

      <div className="space-y-2">
        {snapshot.commitments.map((commitment) => (
          <CommitmentCard key={commitment.id} commitment={commitment} />
        ))}
      </div>

      <AddCardLink href="/bills/new" label="Add a bill" />
    </AppShell>
  );
}
