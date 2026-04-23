/**
 * Builds a compact, whitelisted financial snapshot for Ask Keel grounding.
 *
 * @module lib/ai/ask-context
 */

import { calculateAvailableMoney } from "@/lib/engine/keel";
import { applyGoalSkipsToGoal } from "@/lib/engine/skips";
import { buildProjectionChunkFromState, getProjectionEngineInput } from "@/lib/persistence/dashboard";
import { roundMoney } from "@/lib/utils";

export type AskContextSnapshot = {
  balanceAsOf: string;
  bankBalance: number;
  availableMoney: number;
  /** End of 42-day projection window from balance-as-of, using active skips. */
  endProjectedAvailableMoney42d: number;
  incomes: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: string;
    nextPayDate: string;
  }>;
  commitments: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: string;
    nextDueDate: string;
    category: string;
  }>;
  goals: Array<{
    id: string;
    name: string;
    contributionPerPay: number;
    currentBalance: number;
    targetAmount?: number;
    targetDate?: string;
  }>;
};

/**
 * Loads the signed-in user's projection engine state and derives numbers the Sonnet
 * branch may cite (available money, short-horizon end balance, entity list).
 */
export async function buildAskContextSnapshot(): Promise<AskContextSnapshot> {
  const { state, activeSkips } = await getProjectionEngineInput();
  const asOf = new Date(`${state.user.balanceAsOf}T00:00:00Z`);
  const activeCommitments = state.commitments.filter((c) => !c.archivedAt);
  const activeIncomes = state.incomes.filter((i) => !i.archivedAt);
  const primaryIncomeForGoals =
    state.incomes.find((income) => income.id === state.primaryIncomeId) ?? null;

  const goalsAdjusted = state.goals.map((goal) =>
    applyGoalSkipsToGoal(
      {
        id: goal.id,
        name: goal.name,
        contributionPerPay: goal.contributionPerPay,
        fundedByIncomeId: goal.fundedByIncomeId,
        currentBalance: goal.currentBalance,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      },
      activeSkips.goalSkips.filter((skip) => skip.goalId === goal.id),
      { payFrequency: primaryIncomeForGoals?.frequency },
    ),
  );

  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: state.user.bankBalance,
    incomes: state.incomes,
    primaryIncomeId: state.primaryIncomeId,
    commitments: activeCommitments,
    goals: goalsAdjusted,
    asOf,
  });

  const chunk = buildProjectionChunkFromState({
    state,
    activeSkips,
    startDateIso: state.user.balanceAsOf,
    horizonDays: 42,
  });
  const endProjected =
    chunk.length > 0 ? chunk[chunk.length - 1]!.projectedAvailableMoney! : availableMoneyResult.availableMoney;

  return {
    balanceAsOf: state.user.balanceAsOf,
    bankBalance: state.user.bankBalance,
    availableMoney: roundMoney(availableMoneyResult.availableMoney),
    endProjectedAvailableMoney42d: roundMoney(endProjected),
    incomes: activeIncomes.map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      frequency: i.frequency,
      nextPayDate: i.nextPayDate,
    })),
    commitments: activeCommitments.map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount,
      frequency: c.frequency,
      nextDueDate: c.nextDueDate,
      category: c.category,
    })),
    goals: goalsAdjusted.map((g) => ({
      id: g.id,
      name: g.name,
      contributionPerPay: g.contributionPerPay,
      currentBalance: g.currentBalance ?? 0,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
    })),
  };
}

/**
 * JSON block embedded in the Sonnet system prompt.
 */
export function formatAskSnapshotForPrompt(snapshot: AskContextSnapshot): string {
  return `GROUNDED_SNAPSHOT_JSON (cite only facts from this object; never invent amounts or dates):\n${JSON.stringify(snapshot)}`;
}
