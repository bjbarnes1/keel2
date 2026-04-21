/**
 * Settings → wealth: snapshot + history for manual holdings.
 *
 * @module app/settings/wealth/page
 */

import { AppShell } from "@/components/keel/primitives";
import { WealthOverview } from "@/components/keel/wealth-overview";
import { getWealthHistory, getWealthSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SettingsWealthPage() {
  const [snapshot, history] = await Promise.all([
    getWealthSnapshot(),
    getWealthHistory({ years: 3 }),
  ]);

  return (
    <AppShell title="Wealth" currentPath="/settings" backHref="/settings">
      <WealthOverview snapshot={snapshot} history={history} addHref="/settings/wealth/new" />
    </AppShell>
  );
}
