/**
 * CSV import wizard (`SpendImportFlow`).
 *
 * @module app/spend/import/page
 */

import Link from "next/link";

import { SpendImportFlow } from "@/components/keel/spend-import-flow";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getSpendOverview } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SpendImportPage() {
  const overview = await getSpendOverview();

  return (
    <AppShell title="Import CSV" currentPath="/spend" backHref="/spend">
      {overview.accounts.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Create a spend account first so imports have somewhere to land.
          </p>
          <Link
            href="/spend/accounts/new"
            className="inline-flex rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
          >
            Add account
          </Link>
        </SurfaceCard>
      ) : (
        <SpendImportFlow accounts={overview.accounts} />
      )}
    </AppShell>
  );
}
