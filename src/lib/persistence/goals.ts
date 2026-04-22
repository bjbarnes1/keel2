/**
 * Savings goal persistence (contributions, targets, optional funding income link).
 *
 * Smaller surface area than commitments/incomes — mostly CRUD for the goals UI.
 *
 * @module lib/persistence/goals
 */

import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { readState, writeState, type StoredGoal } from "./state";

export async function getGoalForEdit(id: string) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    return state.goals.find((goal) => goal.id === id) ?? null;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const goal = await prisma.goal.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!goal) return null;

  const result: StoredGoal = {
    id: goal.id,
    name: goal.name,
    contributionPerPay: Number(goal.contributionPerPay),
    currentBalance: Number(goal.currentBalance),
    targetAmount: goal.targetAmount ? Number(goal.targetAmount) : undefined,
    targetDate: goal.targetDate?.toISOString().slice(0, 10),
    fundedByIncomeId: goal.fundedByIncomeId ?? undefined,
  };
  return result;
}

export async function createGoal(input: {
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
  fundedByIncomeId?: string;
}) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (incomes.length === 0) {
      throw new Error("No income found to create a goal.");
    }

    const primaryIncomeId =
      incomes.find((i) => i.isPrimary)?.id ?? incomes[0]!.id;

    await prisma.goal.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        contributionPerPay: input.contributionPerPay,
        currentBalance: input.currentBalance,
        targetAmount: input.targetAmount ?? null,
        targetDate: input.targetDate
          ? new Date(`${input.targetDate}T00:00:00Z`)
          : null,
        fundedByIncomeId: input.fundedByIncomeId ?? primaryIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.goals.push({
    id: randomUUID(),
    ...input,
  });
  await writeState(state);
}
