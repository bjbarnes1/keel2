/**
 * Incomes list: set primary, archive via kebab, edit via sheet (shared record pattern).
 *
 * @module app/settings/incomes/page
 */

import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SettingsIncomesClient } from "@/components/keel/settings-incomes-client";
import { getDashboardSnapshot, getIncomeForEdit } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SettingsIncomesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const q = await searchParams;
  const initialEditId = q.edit?.trim() || undefined;

  const snapshot = await getDashboardSnapshot();

  const ordered = snapshot.incomes
    .slice()
    .sort((left, right) => {
      if (left.id === snapshot.primaryIncomeId) return -1;
      if (right.id === snapshot.primaryIncomeId) return 1;
      return left.name.localeCompare(right.name);
    });

  const rows = ordered.map((income) => ({
    id: income.id,
    name: income.name,
    amount: income.amount,
    frequency: income.frequency,
    nextPayDate: income.nextPayDate,
  }));

  const editPayloads = (
    await Promise.all(ordered.map((row) => getIncomeForEdit(row.id)))
  ).filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <AppShell title="Incomes" currentPath="/settings" backHref="/settings">
      <div className="space-y-3">
        <SurfaceCard className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Your pay sources</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Commitments and goals can be allocated to a specific income so per-pay amounts match
              the right cadence. Edits apply from a date you choose—past periods stay as they were.
            </p>
          </div>
          <Link
            href="/settings/incomes/new"
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
          >
            + Add
          </Link>
        </SurfaceCard>

        <SettingsIncomesClient
          incomes={rows}
          primaryIncomeId={snapshot.primaryIncomeId}
          editPayloads={editPayloads}
          initialEditId={initialEditId}
        />
      </div>
    </AppShell>
  );
}
