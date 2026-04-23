/**
 * Builds a compact, whitelisted financial snapshot for Ask Keel grounding (Phase 1+2).
 *
 * Optional per-user 60s cache reduces repeated Sonnet cost when the user asks follow-ups quickly.
 *
 * @module lib/ai/ask-context
 */

import { annualizeAmount, calculateAvailableMoney } from "@/lib/engine/keel";
import type { CommitmentFrequency, PayFrequency } from "@/lib/types";
import { applyGoalSkipsToGoal } from "@/lib/engine/skips";
import { buildProjectionChunkFromState, getProjectionEngineInput } from "@/lib/persistence/dashboard";
import { roundMoney } from "@/lib/utils";

const SNAPSHOT_TTL_MS = 60_000;
const snapshotCache = new Map<string, { at: number; snapshot: AskContextSnapshot }>();

export type AskContextSnapshot = {
  balanceAsOf: string;
  bankBalance: number;
  availableMoney: number;
  /** End of 42-day projection window from balance-as-of, using active skips. */
  endProjectedAvailableMoney42d: number;
  /** Matches {@link calculateAvailableMoney} breakdown for prose answers. */
  availableMoneyComponents?: {
    totalReserved: number;
    totalGoalContributions: number;
  };
  /** Next slice of projection events for “when is my next pay” style questions. */
  upcomingEvents: Array<{
    date: string;
    type: "income" | "bill";
    name: string;
    amount: number;
    projectedAvailableMoney: number;
  }>;
  /** Lightweight headline stats derived from the snapshot (approximations). */
  projections?: {
    annualIncomeTotal: number;
    annualCommitmentsTotal: number;
  };
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
 *
 * @param opts.userId When set, the same snapshot may be reused for 60 seconds for that user.
 */
export async function buildAskContextSnapshot(opts?: { userId?: string }): Promise<AskContextSnapshot> {
  const userId = opts?.userId;
  const now = Date.now();
  if (userId) {
    const hit = snapshotCache.get(userId);
    if (hit && now - hit.at < SNAPSHOT_TTL_MS) {
      return hit.snapshot;
    }
  }

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

  const upcomingEvents = chunk.slice(0, 18).map((row) => ({
    date: row.date,
    type: row.type,
    name: row.label,
    amount: row.amount,
    projectedAvailableMoney: row.projectedAvailableMoney,
  }));

  let annualIncomeTotal = 0;
  for (const i of activeIncomes) {
    annualIncomeTotal += annualizeAmount(i.amount, i.frequency as PayFrequency);
  }
  let annualCommitmentsTotal = 0;
  for (const c of activeCommitments) {
    annualCommitmentsTotal += annualizeAmount(c.amount, c.frequency as CommitmentFrequency);
  }

  const snapshot: AskContextSnapshot = {
    balanceAsOf: state.user.balanceAsOf,
    bankBalance: state.user.bankBalance,
    availableMoney: roundMoney(availableMoneyResult.availableMoney),
    endProjectedAvailableMoney42d: roundMoney(endProjected),
    availableMoneyComponents: {
      totalReserved: roundMoney(availableMoneyResult.totalReserved),
      totalGoalContributions: roundMoney(availableMoneyResult.totalGoalContributions),
    },
    upcomingEvents,
    projections: {
      annualIncomeTotal: roundMoney(annualIncomeTotal),
      annualCommitmentsTotal: roundMoney(annualCommitmentsTotal),
    },
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

  if (userId) {
    snapshotCache.set(userId, { at: now, snapshot });
  }

  return snapshot;
}

/**
 * JSON block embedded in the Sonnet system prompt.
 */
export function formatAskSnapshotForPrompt(snapshot: AskContextSnapshot): string {
  return `GROUNDED_SNAPSHOT_JSON (cite only facts from this object; never invent amounts or dates):\n${JSON.stringify(snapshot)}`;
}
