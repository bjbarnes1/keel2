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
        <IncomeCard income={snapshot.income} />
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
    </AppShell>
  );
}
