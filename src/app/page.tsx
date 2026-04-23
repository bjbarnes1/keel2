/**
 * Home dashboard: Server Component that loads `getDashboardSnapshot()` and renders
 * available money, upcoming projection rows, and goal cards inside `AppShell`.
 *
 * `force-dynamic` — figures are user-specific and must not be statically cached.
 *
 * @module app/page
 */

import Link from "next/link";

import {
  AppShell,
  HeroAvailableMoneyCard,
  SurfaceCard,
} from "@/components/keel/primitives";
import { HomeUpcomingRows } from "@/components/keel/home-upcoming-rows";
import { GoalRow } from "@/components/keel/goal-row";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell title="Keel" currentPath="/">
      <HeroAvailableMoneyCard
        amount={snapshot.availableMoney}
        bankBalance={snapshot.bankBalance}
        reserved={snapshot.totalReserved}
        goalContributions={snapshot.totalGoalContributions}
      />

      <HomeUpcomingRows incomes={snapshot.incomes} timeline={snapshot.timeline} />

      <div className="mt-4 flex items-center justify-between px-3 pb-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
          Goals
        </p>
        <Link href="/goals/new" className="text-xs font-medium text-[color:var(--keel-ink-3)]">
          Add goal
        </Link>
      </div>

      <SurfaceCard className="!p-0 overflow-hidden">
        {snapshot.goals.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[color:var(--keel-ink-3)]">
            Add a goal to track your savings progress.
          </div>
        ) : (
          snapshot.goals.map((goal) => <GoalRow key={goal.id} goal={goal} />)
        )}
      </SurfaceCard>

      <SurfaceCard className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Bank balance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last updated {snapshot.balanceAsOf}. {snapshot.alert}
          </p>
        </div>
        <Link href="/balance" className="text-sm font-medium text-primary">
          Adjust
        </Link>
      </SurfaceCard>

      <SurfaceCard className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Spend &amp; imports</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Import bank CSVs and tag real transactions to your categories.
          </p>
        </div>
        <Link href="/spend" className="text-sm font-medium text-primary">
          Open
        </Link>
      </SurfaceCard>
    </AppShell>
  );
}
