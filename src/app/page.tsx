import Link from "next/link";

import {
  AppShell,
  HeroAvailableMoneyCard,
  IncomeCard,
  ProjectionRow,
  SectionTitle,
  SurfaceCard,
} from "@/components/keel/primitives";
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

      <div className="mt-4">
        <div className="space-y-2">
          {snapshot.incomes
            .slice()
            .sort((left, right) => {
              if (left.id === snapshot.primaryIncomeId) return -1;
              if (right.id === snapshot.primaryIncomeId) return 1;
              return left.name.localeCompare(right.name);
            })
            .map((income) => (
              <IncomeCard key={income.id} income={income} />
            ))}
        </div>
      </div>

      <SectionTitle title="Upcoming" />
      <div className="space-y-0">
        {snapshot.timeline.slice(0, 4).map((event) => (
          <ProjectionRow key={event.id} event={event} />
        ))}
      </div>

      <SurfaceCard className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Last updated {snapshot.balanceAsOf}</p>
          <p className="mt-1 text-xs text-muted-foreground">{snapshot.alert}</p>
        </div>
        <Link href="/balance" className="text-sm font-medium text-primary">
          Update
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
