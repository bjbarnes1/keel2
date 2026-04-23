/**
 * Goal detail: hero summary, progress toward target, funding income, trajectory hint,
 * and upcoming modelled contributions with skip affordances.
 *
 * @module app/goals/[id]/page
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GoalDetailUpcoming } from "@/components/keel/goal-detail-upcoming";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import type { EngineGoal } from "@/lib/engine/keel";
import { collectScheduledProjectionEvents } from "@/lib/engine/keel";
import {
  getActiveSkipsForBudget,
  getBudgetContext,
  getDashboardSnapshot,
  getGoalForEdit,
  getSkipHistoryForGoal,
} from "@/lib/persistence/keel-store";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

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

  const { budget } = await getBudgetContext();
  const activeSkips = await getActiveSkipsForBudget(budget.id);
  const existingGoalSkips = activeSkips.goalSkips.filter((row) => row.goalId === id);
  const payFrequency = incomeSource?.frequency ?? "fortnightly";
  const baseGoal: EngineGoal = {
    id: goal.id,
    name: goal.name,
    contributionPerPay: goal.contributionPerPay,
    fundedByIncomeId: goal.fundedByIncomeId,
    currentBalance: goal.currentBalance,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
  };

  const targetAmount = display.targetAmount;
  const hasTarget = targetAmount != null && targetAmount > 0;
  const progressPct = hasTarget ? Math.min(100, Math.round((display.currentBalance / targetAmount) * 100)) : null;

  return (
    <AppShell title={goal.name} currentPath="/goals" backHref="/goals">
      <SurfaceCard className="overflow-hidden !p-0">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
            Savings goal
          </p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-[color:var(--keel-ink)]">
            {formatAud(display.currentBalance)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">Saved so far</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {progressPct != null && hasTarget ? (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-[color:var(--keel-ink-3)]">Toward target</p>
                <p className="font-mono text-sm text-[color:var(--keel-ink)]">
                  {formatAud(display.currentBalance)} / {formatAud(targetAmount)}
                </p>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label="Progress toward goal target"
              >
                <div
                  className="h-full rounded-full bg-emerald-500/85 transition-[width] duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[color:var(--keel-ink-4)]">{progressPct}% of your target</p>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--keel-ink-3)]">
              Add a target amount on edit to track how close you are to finishing this goal.
            </p>
          )}
          {display.targetDate ? (
            <p className="text-xs text-[color:var(--keel-ink-3)]">
              Target date <span className="text-[color:var(--keel-ink-2)]">{display.targetDate}</span>
            </p>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
          Each pay
        </p>
        <p className="mt-1 font-mono text-xl font-semibold text-[color:var(--keel-ink)]">
          {formatAud(display.contributionPerPay)}
        </p>
        <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">
          Modelled transfer each {sentenceCaseFrequency(payFrequency)} pay, after active skips.
        </p>
      </SurfaceCard>

      {incomeSource ? (
        <SurfaceCard className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
            Funded from
          </p>
          <p className="mt-1 text-sm font-medium text-[color:var(--keel-ink)]">{incomeSource.name}</p>
          <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">
            {formatAud(incomeSource.amount)} · {sentenceCaseFrequency(incomeSource.frequency)}
          </p>
          <Link
            href={`/incomes/${incomeSource.id}`}
            className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            View income
          </Link>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="mt-4">
          <p className="text-sm text-[color:var(--keel-ink-3)]">
            Add an income with a pay rhythm so Keel can model goal transfers.
          </p>
          <Link href="/incomes/new" className="mt-2 inline-block text-xs font-medium text-primary">
            Add income
          </Link>
        </SurfaceCard>
      )}

      <SurfaceCard className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
          Trajectory
        </p>
        {display.projectedCompletionIso ? (
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--keel-ink-2)]">
            With today&apos;s settings and skips, you may reach this target around{" "}
            <span className="font-medium text-emerald-500/95">{display.projectedCompletionIso}</span>.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[color:var(--keel-ink-3)]">
            Once there&apos;s a target and steady contributions, Keel will show a simple completion hint here.
          </p>
        )}
        <p className="mt-3 text-[11px] text-[color:var(--keel-ink-5)]">
          Figures use your bank balance as of {snapshot.balanceAsOf} and the projection engine — not advice.
        </p>
      </SurfaceCard>

      {occurrencesWithSkips.length > 0 ? (
        <Suspense fallback={null}>
          <GoalDetailUpcoming
            goalId={id}
            goalName={goal.name}
            occurrences={occurrencesWithSkips}
            prefillSkipDate={query.skipDate}
            baseGoal={baseGoal}
            existingGoalSkips={existingGoalSkips}
            payFrequency={payFrequency}
          />
        </Suspense>
      ) : (
        <p className="mt-6 text-sm text-[color:var(--keel-ink-3)]">
          Add an income with a next pay date to model goal transfers.
        </p>
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
