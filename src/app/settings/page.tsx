/**
 * Settings index — navigation into household, incomes, categories, spend.
 *
 * @module app/settings/page
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function SettingsPage() {
  return (
    <AppShell title="Settings" currentPath="/settings" backHref="/">
      <div className="space-y-3">
        <Link href="/settings/household" className="block">
          <SurfaceCard className="flex items-center justify-between gap-4 transition-colors hover:border-white/14">
            <div>
              <p className="text-sm font-medium">Household</p>
              <p className="mt-1 text-xs text-muted-foreground">Members and invites</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </SurfaceCard>
        </Link>

        <Link href="/settings/incomes" className="block">
          <SurfaceCard className="flex items-center justify-between gap-4 transition-colors hover:border-white/14">
            <div>
              <p className="text-sm font-medium">Incomes</p>
              <p className="mt-1 text-xs text-muted-foreground">Pay sources and future changes</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </SurfaceCard>
        </Link>

        <Link href="/settings/categories" className="block">
          <SurfaceCard className="flex items-center justify-between gap-4 transition-colors hover:border-white/14">
            <div>
              <p className="text-sm font-medium">Categories</p>
              <p className="mt-1 text-xs text-muted-foreground">Add and organize budget categories</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </SurfaceCard>
        </Link>

        <Link href="/spend" className="block">
          <SurfaceCard className="flex items-center justify-between gap-4 transition-colors hover:border-white/14">
            <div>
              <p className="text-sm font-medium">Spend</p>
              <p className="mt-1 text-xs text-muted-foreground">CSV import, reconcile, budget vs actual</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </SurfaceCard>
        </Link>
      </div>
    </AppShell>
  );
}
