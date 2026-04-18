import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GoalDetailUpcoming } from "@/components/keel/goal-detail-upcoming";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { collectScheduledProjectionEvents } from "@/lib/engine/keel";
import { getDashboardSnapshot, getGoalForEdit, getSkipHistoryForGoal } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skipDate?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [goal, snapshot] = await Promise.all([getGoalForEdit(id), getDashboardSnapshot()]);
  const display = snapshot.goals.find((candidate) => candidate.id === id);

  if (!goal || !display) {
    notFound();
  }

  const incomeSource =
    snapshot.incomes.find((income) => income.id === (goal.fundedByIncomeId ?? snapshot.primaryIncomeId)) ??
    snapshot.incomes[0];

  const asOf = new Date(`${snapshot.balanceAsOfIso}T00:00:00Z`);
  const incomeSchedule =
    incomeSource?.nextPayDateIso != null
      ? collectScheduledProjectionEvents({
          asOf,
          horizonDays: 120,
          incomes: [
            {
              id: incomeSource.id,
              name: incomeSource.name,
              amount: incomeSource.amount,
              frequency: incomeSource.frequency,
              nextPayDate: incomeSource.nextPayDateIso,
            },
          ],
          commitments: [],
        }).filter((event) => event.type === "income")
      : [];

  const occurrences = incomeSchedule.slice(0, 8).map((event) => ({
    iso: event.date,
    amount: goal.contributionPerPay,
  }));

  const skipHistory = await getSkipHistoryForGoal(id);
  const activeSkipByIso = new Map(
    skipHistory
      .filter((row) => !row.revokedAt)
      .map((row) => [row.originalDate.toISOString().slice(0, 10), row.id]),
  );

  const occurrencesWithSkips = occurrences.map((row) => ({
    ...row,
    activeSkipId: activeSkipByIso.get(row.iso),
  }));

  return (
    <AppShell title={goal.name} currentPath="/goals" backHref="/goals">
      <SurfaceCard>
        <p className="text-sm text-[color:var(--keel-ink-3)]">Per pay (modeled)</p>
        <p className="mt-1 font-mono text-xl font-semibold text-[color:var(--keel-ink)]">
          {formatAud(display.contributionPerPay)}
        </p>
        {display.targetDate ? (
          <p className="mt-2 text-xs text-[color:var(--keel-ink-3)]">Target {display.targetDate}</p>
        ) : null}
        {display.projectedCompletionIso ? (
          <p className="mt-1 text-xs text-emerald-500/90">Adjusted hint: {display.projectedCompletionIso}</p>
        ) : null}
      </SurfaceCard>

      {occurrencesWithSkips.length > 0 ? (
        <Suspense fallback={null}>
          <GoalDetailUpcoming
            goalId={id}
            goalName={goal.name}
            occurrences={occurrencesWithSkips}
            prefillSkipDate={query.skipDate}
          />
        </Suspense>
      ) : (
        <p className="mt-6 text-sm text-[color:var(--keel-ink-3)]">Add an income with a next pay date to model goal transfers.</p>
      )}

      <Link
        href="/goals"
        className="mt-8 inline-block text-sm text-[color:var(--keel-ink-3)] underline-offset-4 hover:text-[color:var(--keel-ink-2)]"
      >
        ← All goals
      </Link>
    </AppShell>
  );
}
