import { AddCardLink, AppShell, GoalCard } from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell title="Goals" currentPath="/goals">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Setting aside each pay</p>
          <p className="mt-2 text-xs text-muted-foreground">
            across {snapshot.goals.length} goals
          </p>
        </div>
        <p className="font-mono text-2xl font-bold text-primary">
          {formatAud(snapshot.totalGoalContributions)}
        </p>
      </div>

      <div className="space-y-2">
        {snapshot.goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>

      <AddCardLink href="/goals/new" label="Add a goal" />
    </AppShell>
  );
}
