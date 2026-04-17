import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function SettingsPage() {
  return (
    <AppShell title="Settings" currentPath="/settings" backHref="/">
      <div className="space-y-3">
        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Household</p>
            <p className="mt-1 text-xs text-muted-foreground">Members and invites</p>
          </div>
          <Link
            href="/settings/household"
            className="text-sm font-medium text-primary"
          >
            Open
          </Link>
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Incomes</p>
            <p className="mt-1 text-xs text-muted-foreground">Pay sources and future changes</p>
          </div>
          <Link
            href="/settings/incomes"
            className="text-sm font-medium text-primary"
          >
            Open
          </Link>
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Wealth</p>
            <p className="mt-1 text-xs text-muted-foreground">Shares and crypto</p>
          </div>
          <Link
            href="/settings/wealth"
            className="text-sm font-medium text-primary"
          >
            Open
          </Link>
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Spend</p>
            <p className="mt-1 text-xs text-muted-foreground">CSV import, reconcile, budget vs actual</p>
          </div>
          <Link href="/spend" className="text-sm font-medium text-primary">
            Open
          </Link>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
