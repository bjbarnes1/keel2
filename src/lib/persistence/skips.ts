/**
 * Skip persistence: active commitment/goal skips for projection overlays.
 *
 * `getActiveSkipsForBudget` returns DTOs consumed by `applySkipsToEvents` in the engine.
 * Rows are budget-scoped; strategies (`MAKE_UP_NEXT`, `SPREAD`, …) are validated before
 * being mapped into `SkipInput` unions.
 *
 * @module lib/persistence/skips
 */

import { getPrismaClient } from "@/lib/prisma";
import type {
  CommitmentSkipInput,
  CommitmentSkipStrategy,
  GoalSkipInput,
  GoalSkipStrategy,
  IncomeSkipInput,
} from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

function isCommitmentSkipStrategy(value: string): value is CommitmentSkipStrategy {
  return (
    value === "MAKE_UP_NEXT" ||
    value === "SPREAD" ||
    value === "MOVE_ON" ||
    value === "STANDALONE"
  );
}

function isGoalSkipStrategy(value: string): value is GoalSkipStrategy {
  return value === "EXTEND_DATE" || value === "REBALANCE";
}

export type ActiveSkipsBundle = {
  commitmentSkips: CommitmentSkipInput[];
  goalSkips: GoalSkipInput[];
  incomeSkips: IncomeSkipInput[];
};

export async function getActiveSkipsForBudget(budgetId: string): Promise<ActiveSkipsBundle> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return { commitmentSkips: [], goalSkips: [], incomeSkips: [] };
  }

  const prisma = getPrismaClient();
  const [commitmentRows, goalRows, incomeRows] = await Promise.all([
    prisma.commitmentSkip.findMany({ where: { budgetId, revokedAt: null } }),
    prisma.goalSkip.findMany({ where: { budgetId, revokedAt: null } }),
    prisma.incomeSkip.findMany({ where: { budgetId, revokedAt: null } }),
  ]);

  return {
    commitmentSkips: commitmentRows.flatMap((row) => {
      if (!isCommitmentSkipStrategy(row.strategy)) {
        console.warn(`[getActiveSkipsForBudget] unknown commitment strategy "${row.strategy}" for skip ${row.id}, skipping`);
        return [];
      }
      return [{
        kind: "commitment" as const,
        skipId: row.id,
        commitmentId: row.commitmentId,
        originalDateIso: row.originalDate.toISOString().slice(0, 10),
        strategy: row.strategy,
        spreadOverN: row.spreadOverN ?? undefined,
        redirectTo: row.redirectTo ?? undefined,
      }];
    }),
    goalSkips: goalRows.flatMap((row) => {
      if (!isGoalSkipStrategy(row.strategy)) {
        console.warn(`[getActiveSkipsForBudget] unknown goal strategy "${row.strategy}" for skip ${row.id}, skipping`);
        return [];
      }
      return [{
        kind: "goal" as const,
        skipId: row.id,
        goalId: row.goalId,
        originalDateIso: row.originalDate.toISOString().slice(0, 10),
        strategy: row.strategy,
      }];
    }),
    incomeSkips: incomeRows.map((row) => ({
      kind: "income" as const,
      skipId: row.id,
      incomeId: row.incomeId,
      originalDateIso: row.originalDate.toISOString().slice(0, 10),
      strategy: "STANDALONE" as const,
    })),
  };
}

/**
 * Active income skips for a single income (for detail UI).
 */
export async function listActiveIncomeSkipsForIncome(incomeId: string) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [];
  }
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();
  const rows = await prisma.incomeSkip.findMany({
    where: { budgetId: budget.id, incomeId, revokedAt: null },
    orderBy: { originalDate: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    originalDateIso: row.originalDate.toISOString().slice(0, 10),
    createdAt: row.createdAt,
  }));
}

export async function getSkipHistoryForCommitment(commitmentId: string) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();
  return prisma.commitmentSkip.findMany({
    where: { budgetId: budget.id, commitmentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSkipHistoryForGoal(goalId: string) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();
  return prisma.goalSkip.findMany({
    where: { budgetId: budget.id, goalId },
    orderBy: { createdAt: "desc" },
  });
}
