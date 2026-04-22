/**
 * Tab-bar wealth overview (requires DB — shows fallback copy otherwise).
 *
 * @module app/wealth/page
 */

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { WealthOverview } from "@/components/keel/wealth-overview";
import { getWealthHistory, getWealthSnapshot, hasConfiguredDatabase } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function WealthPage() {
  if (!hasConfiguredDatabase()) {
    return (
      <AppShell title="Wealth" currentPath="/wealth">
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">
            Wealth tracking uses your linked database. Configure{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> and sign in to see
            holdings on this tab.
          </p>
        </SurfaceCard>
      </AppShell>
    );
  }

  const [snapshot, history] = await Promise.all([
    getWealthSnapshot(),
    getWealthHistory({ years: 3 }),
  ]);

  return (
    <AppShell title="Wealth" currentPath="/wealth">
      <WealthOverview snapshot={snapshot} history={history} addHref="/wealth/new" />
    </AppShell>
  );
}
