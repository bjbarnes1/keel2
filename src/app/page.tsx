/**
 * Home dashboard: household cockpit (desktop) plus available money, projection rows,
 * and goals. Loads `getDashboardSnapshot()`, `getWealthSnapshot()`, and `getSpendOverview()`.
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
import {
  HouseholdCockpit,
  payFortnightFromSnapshot,
} from "@/components/keel/household-cockpit";
import { HomeUpcomingRows } from "@/components/keel/home-upcoming-rows";
import { GoalRow } from "@/components/keel/goal-row";
import { InsightCard } from "@/components/keel/insight-card";
import {
  getDashboardSnapshot,
  getLatestAiInsight,
  getSpendOverview,
  getWealthSnapshot,
  listOutstandingRebates,
} from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [snapshot, insight, wealth, spend, rebates] = await Promise.all([
    getDashboardSnapshot(),
    getLatestAiInsight(),
    getWealthSnapshot(),
    getSpendOverview(),
    listOutstandingRebates(),
  ]);

  const aiEnabled = process.env.KEEL_AI_ENABLED === "true";
  const payFortnight = payFortnightFromSnapshot(snapshot);

  return (
    <AppShell title="Keel" currentPath="/">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-10">
        <div className="min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-24">
            <HouseholdCockpit
              snapshot={snapshot}
              wealthHoldings={wealth.holdings}
              wealthTotal={wealth.totalValue}
              spend={{
                needsReview: spend.needsReview,
                accountCount: spend.accounts.length,
              }}
              payFortnight={payFortnight}
              actionExtras={{ outstandingRebates: rebates.length }}
            />
          </div>
        </div>

        <div className="min-w-0 lg:order-1 lg:max-w-[780px]">
          <HeroAvailableMoneyCard
            amount={snapshot.availableMoney}
            bankBalance={snapshot.bankBalance}
            reserved={snapshot.totalReserved}
            goalContributions={snapshot.totalGoalContributions}
          />

          {(aiEnabled || insight) ? (
            <InsightCard insight={insight} aiEnabled={aiEnabled} />
          ) : null}

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
        </div>
      </div>
    </AppShell>
  );
}
