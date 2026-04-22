/**
 * Goals list surface.
 *
 * @module app/goals/page
 */

import Link from "next/link";

import { AppShell, GoalCard, SurfaceCard } from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell title="Goals" currentPath="/goals">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-[color:var(--keel-ink-3)]">
          Open a goal for details, skip a modeled transfer, or add another savings target.
        </p>
        <Link
          href="/goals/new"
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Add goal
        </Link>
      </div>
      <ul className="space-y-3">
        {snapshot.goals.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-[color:var(--keel-ink-3)]">No goals yet.</p>
          </SurfaceCard>
        ) : (
          snapshot.goals.map((goal) => (
            <li key={goal.id}>
              <GoalCard goal={goal} />
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}
