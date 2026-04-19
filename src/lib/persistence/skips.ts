import { getPrismaClient } from "@/lib/prisma";
import type {
  CommitmentSkipInput,
  CommitmentSkipStrategy,
  GoalSkipInput,
  GoalSkipStrategy,
} from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

function isCommitmentSkipStrategy(value: string): value is CommitmentSkipStrategy {
  return value === "MAKE_UP_NEXT" || value === "SPREAD" || value === "MOVE_ON";
}

function isGoalSkipStrategy(value: string): value is GoalSkipStrategy {
  return value === "EXTEND_DATE" || value === "REBALANCE";
}

export type ActiveSkipsBundle = {
  commitmentSkips: CommitmentSkipInput[];
  goalSkips: GoalSkipInput[];
};

export async function getActiveSkipsForBudget(budgetId: string): Promise<ActiveSkipsBundle> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return { commitmentSkips: [], goalSkips: [] };
  }

  const prisma = getPrismaClient();
  const [commitmentRows, goalRows] = await Promise.all([
    prisma.commitmentSkip.findMany({ where: { budgetId, revokedAt: null } }),
    prisma.goalSkip.findMany({ where: { budgetId, revokedAt: null } }),
  ]);

  return {
    commitmentSkips: commitmentRows.map((row) => ({
      kind: "commitment" as const,
      skipId: row.id,
      commitmentId: row.commitmentId,
      originalDateIso: row.originalDate.toISOString().slice(0, 10),
      strategy: isCommitmentSkipStrategy(row.strategy) ? row.strategy : "MAKE_UP_NEXT",
      spreadOverN: row.spreadOverN ?? undefined,
      redirectTo: row.redirectTo ?? undefined,
    })),
    goalSkips: goalRows.map((row) => ({
      kind: "goal" as const,
      skipId: row.id,
      goalId: row.goalId,
      originalDateIso: row.originalDate.toISOString().slice(0, 10),
      strategy: isGoalSkipStrategy(row.strategy) ? row.strategy : "EXTEND_DATE",
    })),
  };
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
