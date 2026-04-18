import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell title="Goals" currentPath="/goals">
      <p className="mb-4 text-sm text-[color:var(--keel-ink-3)]">
        Open a goal to skip a modeled transfer or review pacing. More goal tooling is still on the way.
      </p>
      <ul className="space-y-3">
        {snapshot.goals.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-[color:var(--keel-ink-3)]">No goals yet.</p>
          </SurfaceCard>
        ) : (
          snapshot.goals.map((goal) => (
            <li key={goal.id}>
              <Link href={`/goals/${goal.id}`}>
                <SurfaceCard className="transition-colors hover:border-white/20">
                  <p className="font-medium text-[color:var(--keel-ink)]">{goal.name}</p>
                  <p className="mt-1 font-mono text-sm text-[color:var(--keel-ink-2)]">
                    {formatAud(goal.contributionPerPay)} / pay
                  </p>
                </SurfaceCard>
              </Link>
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}
