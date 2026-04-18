import Link from "next/link";

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
            holdings here (same data as{" "}
            <Link href="/settings/wealth" className="font-medium text-primary underline-offset-4 hover:underline">
              Settings → Wealth
            </Link>
            ).
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
      <WealthOverview snapshot={snapshot} history={history} addHref="/settings/wealth/new" />
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prefer the settings layout?{" "}
        <Link href="/settings/wealth" className="font-medium text-primary underline-offset-4 hover:underline">
          Open wealth in Settings
        </Link>
      </p>
    </AppShell>
  );
}
