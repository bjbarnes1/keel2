/**
 * Dashboard aggregation: builds `DashboardSnapshot` for the home + timeline surfaces.
 *
 * Responsibilities:
 * - Loads budget-scoped entities (incomes, commitments, goals, skips) either from
 *   Prisma or the JSON demo store.
 * - Runs pure engine functions (`calculateAvailableMoney`, `buildProjectionTimeline`)
 *   to produce `availableMoney`, `timeline`, and multi-horizon forecasts.
 * - Joins spend rollups (`spendTransaction` sums) for “actual vs planned” insights.
 *
 * `unstable_noStore` is applied on hot paths so Next never caches personalized numbers.
 *
 * @module lib/persistence/dashboard
 */

import { unstable_noStore as noStore } from "next/cache";

import {
  annualizeAmount,
  buildProjectionTimeline,
  calculateAvailableMoney,
  collectScheduledProjectionEvents,
  detectProjectedShortfall,
  getCurrentPayPeriod,
  isCommitmentInAttention,
} from "@/lib/engine/keel";
import {
  applyGoalSkipsToGoal,
  commitmentSkipDisplayIndex,
  parseBillEventCommitmentId,
} from "@/lib/engine/skips";
import { getPrismaClient } from "@/lib/prisma";
import type {
  CommitmentCategory,
  DashboardSnapshot,
  ForecastHorizon,
  SkipInput,
} from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import {
  getActiveSkipsForBudget,
  type ActiveSkipsBundle,
} from "./skips";
import { formatShortDate, readState, type StoredKeelState } from "./state";

type ProjectionEvent = ReturnType<typeof buildProjectionTimeline>[number];

/**
 * Loads commitments and aggregates spend (last 365 UTC days, negative amounts only) by `commitmentId`.
 * Used for “actual vs planned” on the dashboard when Prisma + auth are configured.
 */
async function fetchSpendAttributionRollups(input: { budgetId: string }) {
  const prisma = getPrismaClient();

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 365);

  const [commitments, spendGroups] = await Promise.all([
    prisma.commitment.findMany({
      where: { budgetId: input.budgetId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.spendTransaction.groupBy({
      by: ["commitmentId"],
      where: {
        budgetId: input.budgetId,
        commitmentId: { not: null },
        postedOn: { gte: start, lte: end },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  const spendById = new Map<string, number>();
  let annualSpendActualToDate = 0;

  for (const row of spendGroups) {
    const commitmentId = row.commitmentId;
    if (!commitmentId) continue;

    const raw = Number(row._sum.amount ?? 0);
    const spend = Math.abs(raw);
    spendById.set(commitmentId, spend);
    annualSpendActualToDate += spend;
  }

  const spendByCommitment = commitments.map((commitment) => ({
    commitmentId: commitment.id,
    name: commitment.name,
    last365Spend: spendById.get(commitment.id) ?? 0,
  }));

  return { annualSpendActualToDate, spendByCommitment };
}

/**
 * Samples projected available money along a horizon for compact sparkline arrays.
 *
 * Builds once from the longest engine run (see call sites) then reuses the same event
 * stream for 30/90/365-day windows — avoids triple `buildProjectionTimeline` work.
 */
function sampleProjectionSparkline(
  asOf: Date,
  startingAvailableMoney: number,
  events: Array<{ date: string; projectedAvailableMoney: number }>,
  horizonDays: number,
  maxPoints: number,
) {
  if (maxPoints <= 1) return [startingAvailableMoney];

  const byIsoDate = new Map<string, number>();
  for (const event of events) {
    byIsoDate.set(event.date, event.projectedAvailableMoney);
  }

  let current = startingAvailableMoney;
  const out: number[] = [];

  for (let i = 0; i <= horizonDays; i += 1) {
    const day = new Date(asOf);
    day.setUTCDate(day.getUTCDate() + i);
    const iso = day.toISOString().slice(0, 10);
    const updated = byIsoDate.get(iso);
    if (updated != null) current = updated;
    out.push(current);
  }

  if (out.length <= maxPoints) return out;

  const stride = (out.length - 1) / (maxPoints - 1);
  const sampled: number[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round(i * stride);
    sampled.push(out[Math.min(out.length - 1, index)]!);
  }
  return sampled;
}

/**
 * Inclusive horizon end as `YYYY-MM-DD` in UTC, `horizonDays` after `asOf`’s calendar day.
 */
function horizonCutoffIso(asOf: Date, horizonDays: number) {
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() + horizonDays);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Builds one {@link ForecastHorizon} slice: min/end projected balance, event counts, and a downsampled sparkline.
 * @param allEvents Full projection stream (typically 365 days); filtered by {@link horizonCutoffIso} internally.
 */
function summarizeForecast(
  asOf: Date,
  allEvents: ProjectionEvent[],
  startingAvailableMoney: number,
  horizonDays: number,
): ForecastHorizon {
  const cutoffIso = horizonCutoffIso(asOf, horizonDays);
  const events = allEvents.filter((event) => event.date <= cutoffIso);

  const minProjected = events.reduce(
    (min, event) => Math.min(min, event.projectedAvailableMoney),
    startingAvailableMoney,
  );
  const endProjected =
    events.length > 0
      ? events[events.length - 1]!.projectedAvailableMoney
      : startingAvailableMoney;

  const sparkline = sampleProjectionSparkline(
    asOf,
    startingAvailableMoney,
    events,
    horizonDays,
    60,
  );

  return {
    horizonDays,
    minProjectedAvailableMoney: minProjected,
    endProjectedAvailableMoney: endProjected,
    incomeEvents: events.filter((event) => event.type === "income").length,
    billEvents: events.filter((event) => event.type === "bill").length,
    sparkline,
  };
}

/**
 * Pure assembly of {@link DashboardSnapshot} from stored state, spend rollups, and active skips.
 * Runs {@link calculateAvailableMoney} and a single 365-day {@link buildProjectionTimeline}, then derives
 * UI timeline (42d), forecasts (31/92/365d), and attention/skip annotations. Does not touch the database.
 */
function toDashboardSnapshot(
  state: StoredKeelState,
  spendRollups: {
    annualSpendActualToDate: number;
    spendByCommitment: DashboardSnapshot["spendByCommitment"];
  },
  activeSkips: ActiveSkipsBundle = { commitmentSkips: [], goalSkips: [], incomeSkips: [] },
): DashboardSnapshot {
  const asOf = new Date(`${state.user.balanceAsOf}T00:00:00Z`);
  const activeCommitments = state.commitments.filter((c) => !c.archivedAt);
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

  const primaryIncome =
    state.incomes.find((income) => income.id === state.primaryIncomeId) ?? null;
  const payPeriod = getCurrentPayPeriod(primaryIncome, asOf);

  const annualIncomeForecast = state.incomes.reduce(
    (sum, income) => sum + annualizeAmount(income.amount, income.frequency),
    0,
  );
  const annualCommitmentsForecast = activeCommitments.reduce(
    (sum, commitment) => sum + annualizeAmount(commitment.amount, commitment.frequency),
    0,
  );

  const reserveByCommitmentId = new Map(
    availableMoneyResult.commitmentReserves.map((c) => [c.id, c]),
  );

  const timelineHorizonDays = 42;
  const skipInputs: SkipInput[] = [
    ...activeSkips.commitmentSkips,
    ...activeSkips.goalSkips,
    ...(activeSkips.incomeSkips ?? []),
  ];

  // Fix #5: single 365-day build replaces previous 4× calls (42d + 31d + 92d + 365d).
  const MAX_HORIZON_DAYS = 365;
  const timelineFull = buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf,
    horizonDays: MAX_HORIZON_DAYS,
    incomes: state.incomes,
    commitments: activeCommitments,
    skips: skipInputs,
  });

  const timelineCutoffIso = horizonCutoffIso(asOf, timelineHorizonDays);
  const timelineRaw = timelineFull.filter((event) => event.date <= timelineCutoffIso);

  const timelineBaseline = collectScheduledProjectionEvents({
    asOf,
    horizonDays: timelineHorizonDays,
    incomes: state.incomes,
    commitments: activeCommitments,
  });
  const commitmentDisplayRows = activeSkips.commitmentSkips.map((row) => ({
    skipId: row.skipId,
    commitmentId: row.commitmentId,
    originalDateIso: row.originalDateIso,
    strategy: row.strategy,
    spreadOverN: row.spreadOverN,
  }));
  const skipDisplayIndex = commitmentSkipDisplayIndex(timelineBaseline, commitmentDisplayRows);

  const shortfall = detectProjectedShortfall(timelineRaw);

  const incomeIsoDates = timelineRaw
    .filter((event) => event.type === "income")
    .map((event) => event.date);
  const earliestIncomeIso =
    incomeIsoDates.length > 0 ? incomeIsoDates.reduce((min, d) => (d < min ? d : min)) : null;

  return {
    userName: state.user.name,
    budgetName: state.budget.name,
    bankBalance: state.user.bankBalance,
    balanceAsOf: formatShortDate(state.user.balanceAsOf),
    balanceAsOfIso: state.user.balanceAsOf,
    incomes: state.incomes.map((income) => ({
      ...income,
      nextPayDateIso: income.nextPayDate,
      nextPayDate: formatShortDate(income.nextPayDate),
    })),
    primaryIncomeId: state.primaryIncomeId,
    commitments: availableMoneyResult.commitmentReserves.map((commitment) => ({
      ...commitment,
      nextDueDateIso: commitment.nextDueDate,
      nextDueDate: formatShortDate(commitment.nextDueDate),
      category: (commitment.category ?? "Other") as CommitmentCategory,
      isAttention: isCommitmentInAttention({ commitment, payPeriod, asOf })
        ? true
        : undefined,
    })),
    goals: state.goals.map((goal, index) => {
      const adjusted = goalsAdjusted[index]!;
      return {
        ...goal,
        contributionPerPay: adjusted.contributionPerPay,
        targetDate: goal.targetDate ? formatShortDate(goal.targetDate) : undefined,
        projectedCompletionIso: adjusted.projectedCompletionIso,
      };
    }),
    commitmentSkipsActive: activeSkips.commitmentSkips.map((row) => ({
      commitmentId: row.commitmentId,
      originalDateIso: row.originalDateIso,
    })),
    annualIncomeForecast,
    annualCommitmentsForecast,
    annualSpendActualToDate: spendRollups.annualSpendActualToDate,
    spendByCommitment: spendRollups.spendByCommitment,
    totalReserved: availableMoneyResult.totalReserved,
    totalGoalContributions: availableMoneyResult.totalGoalContributions,
    availableMoney: availableMoneyResult.availableMoney,
    timeline: timelineRaw.map((event) => {
      const isoDate = event.date;
      const commitmentId =
        event.type === "bill" ? parseBillEventCommitmentId(event.id) : null;
      const reserve = commitmentId ? reserveByCommitmentId.get(commitmentId) : undefined;
      const isAttention = reserve
        ? isCommitmentInAttention({ commitment: reserve, payPeriod, asOf })
        : false;

      const isNextPayIncome =
        event.type === "income" && earliestIncomeIso != null && event.date === earliestIncomeIso
          ? true
          : undefined;

      const skipRow = event.type === "bill" ? skipDisplayIndex.get(event.id) : undefined;
      const engineSkip = event as typeof event & { isSkipped?: boolean; skipId?: string };
      const incomeSkipped = Boolean(engineSkip.isSkipped && event.type === "income");
      const billSkipped = Boolean(skipRow?.isSkipped);

      return {
        ...event,
        isoDate,
        date: formatShortDate(event.date),
        commitmentId: commitmentId ?? undefined,
        isAttention: isAttention ? true : undefined,
        attentionReserved: isAttention && reserve ? reserve.reserved : undefined,
        isNextPayIncome,
        isSkipped: billSkipped || incomeSkipped ? true : undefined,
        skipId: skipRow?.skipId ?? (incomeSkipped ? engineSkip.skipId : undefined),
        skipStrategy: billSkipped ? skipRow?.strategy : incomeSkipped ? "STANDALONE" : undefined,
        isSkipSpreadTarget: skipRow?.isSpreadTarget ? true : undefined,
        displayAmount: billSkipped || incomeSkipped ? event.amount : undefined,
      };
    }),
    forecast: {
      oneMonth: summarizeForecast(
        asOf,
        timelineFull,
        availableMoneyResult.availableMoney,
        31,
      ),
      threeMonths: summarizeForecast(
        asOf,
        timelineFull,
        availableMoneyResult.availableMoney,
        92,
      ),
      twelveMonths: summarizeForecast(
        asOf,
        timelineFull,
        availableMoneyResult.availableMoney,
        MAX_HORIZON_DAYS,
      ),
    },
    alert: shortfall
      ? `Your available money is projected to go negative around ${formatShortDate(
          shortfall.date,
        )} when ${shortfall.label} hits.`
      : `Your available money stays positive across the next ${timelineHorizonDays} days.`,
  };
}

/**
 * Loads the current budget state, optional spend rollups, active skips, and returns {@link toDashboardSnapshot}.
 * Calls `unstable_noStore` so Next does not cache per-user numbers.
 */
export async function getDashboardSnapshot() {
  noStore();
  const state = await readState();

  const spendRollups =
    hasConfiguredDatabase() && hasSupabaseAuthConfigured()
      ? await fetchSpendAttributionRollups({ budgetId: state.budget.id })
      : {
          annualSpendActualToDate: 0,
          spendByCommitment: [] as DashboardSnapshot["spendByCommitment"],
        };

  const activeSkips = await getActiveSkipsForBudget(state.budget.id);

  return toDashboardSnapshot(state, spendRollups, activeSkips);
}

/**
 * Data for commitment skip preview UIs: scheduled bill events (no skips applied), starting available money,
 * and persisted commitment skips. Re-fetches budget context and active skips; uses `snapshot` for balances/incomes/commitments.
 */
export async function getCommitmentSkipPreviewBundle(snapshot: DashboardSnapshot) {
  noStore();
  const { budget } = await getBudgetContext();
  const activeSkips = await getActiveSkipsForBudget(budget.id);
  const asOf = new Date(`${snapshot.balanceAsOfIso}T00:00:00Z`);

  const engineIncomes = snapshot.incomes
    .filter((income) => Boolean(income.nextPayDateIso))
    .map((income) => ({
      id: income.id,
      name: income.name,
      amount: income.amount,
      frequency: income.frequency,
      nextPayDate: income.nextPayDateIso!,
    }));

  const engineCommitments = snapshot.commitments
    .filter((c) => Boolean(c.nextDueDateIso))
    .map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount,
      frequency: c.frequency,
      nextDueDate: c.nextDueDateIso!,
      fundedByIncomeId: c.fundedByIncomeId,
      category: c.category,
    }));

  const engineGoals = snapshot.goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    contributionPerPay: goal.contributionPerPay,
    fundedByIncomeId: goal.fundedByIncomeId,
    currentBalance: goal.currentBalance,
    targetAmount: goal.targetAmount,
  }));

  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: snapshot.bankBalance,
    incomes: engineIncomes,
    primaryIncomeId: snapshot.primaryIncomeId,
    commitments: engineCommitments,
    goals: engineGoals,
    asOf,
  });

  return {
    baselineOrdered: collectScheduledProjectionEvents({
      asOf,
      horizonDays: 42,
      incomes: engineIncomes,
      commitments: engineCommitments,
    }),
    startingAvailableMoney: availableMoneyResult.availableMoney,
    existingCommitmentSkips: activeSkips.commitmentSkips,
  };
}

/**
 * Returns persisted {@link StoredKeelState} and {@link ActiveSkipsBundle} for the signed-in budget.
 * Intended for server paths that need raw engine inputs (e.g. Ask Keel). Uses `noStore`.
 */
export async function getProjectionEngineInput() {
  noStore();
  const state = await readState();
  const activeSkips = await getActiveSkipsForBudget(state.budget.id);
  return { state, activeSkips };
}

/**
 * Pure helper: runs {@link calculateAvailableMoney} with goal-skip adjustments, then {@link buildProjectionTimeline}
 * for `[startDateIso, startDateIso + horizonDays)`. Safe for unit tests without DB.
 *
 * @param input.state Serialized Keel state (balances, incomes, commitments, goals).
 * @param input.activeSkips Commitment and goal skips applied inside the projection.
 * @param input.startDateIso Chunk start (`YYYY-MM-DD` UTC).
 * @param input.horizonDays Length of the chunk in days from the start date.
 */
export function buildProjectionChunkFromState(input: {
  state: StoredKeelState;
  activeSkips: ActiveSkipsBundle;
  /** Optional override for "now"; defaults to the state's balanceAsOf. */
  asOf?: Date;
  startDateIso: string;
  horizonDays: number;
}) {
  const asOf = input.asOf ?? new Date(`${input.state.user.balanceAsOf}T00:00:00Z`);
  const startDate = new Date(`${input.startDateIso}T00:00:00Z`);
  const activeCommitments = input.state.commitments.filter((c) => !c.archivedAt);

  const primaryIncome =
    input.state.incomes.find((income) => income.id === input.state.primaryIncomeId) ?? null;

  const goalsAdjusted = input.state.goals.map((goal) =>
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
      input.activeSkips.goalSkips.filter((skip) => skip.goalId === goal.id),
      { payFrequency: primaryIncome?.frequency },
    ),
  );

  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: input.state.user.bankBalance,
    incomes: input.state.incomes,
    primaryIncomeId: input.state.primaryIncomeId,
    commitments: activeCommitments,
    goals: goalsAdjusted,
    asOf,
  });

  const skipInputs: SkipInput[] = [
    ...input.activeSkips.commitmentSkips,
    ...input.activeSkips.goalSkips,
    ...(input.activeSkips.incomeSkips ?? []),
  ];

  return buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf,
    startDate,
    horizonDays: input.horizonDays,
    incomes: input.state.incomes,
    commitments: activeCommitments,
    skips: skipInputs,
  });
}
