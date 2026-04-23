/**
 * Layer A builder — assembles the user's observed financial truth plus a 12-month
 * projection from Prisma.
 *
 * **Lifecycle:** built on every Ask Keel request; cached per-user for 60s to cut the
 * cost of follow-up questions in the same session. Any write action in the app should
 * call {@link invalidateLayerACache} to evict stale data.
 *
 * **Payload size:** ~2-4 KB serialized for a typical user (3 commitments, 2 goals,
 * 20 upcoming events). Larger budgets scale linearly with entity count; well within the
 * Sonnet context budget.
 *
 * **Security:** delegates tenancy checks to {@link getProjectionEngineInput} and
 * {@link getWealthSnapshot}, which both fetch via `getBudgetContext()`. This module does
 * no direct Prisma access.
 *
 * @module lib/ai/context/generators/build-layer-a
 */

import {
  annualizeAmount,
  buildProjectionTimeline,
  calculateAvailableMoney,
  type EngineCommitment,
  type EngineGoal,
  type EngineIncome,
  type ProjectionEvent,
} from "@/lib/engine/keel";
import type { CommitmentFrequency, PayFrequency, SkipInput } from "@/lib/types";
import { applyGoalSkipsToGoal } from "@/lib/engine/skips";
import { getProjectionEngineInput, getWealthSnapshot } from "@/lib/persistence/keel-store";
import { roundMoney } from "@/lib/utils";

import {
  layerASchema,
  type LayerA,
  type LayerAActiveSkip,
} from "../schemas/layer-a-schema";

/** 12 months; matches the plan's horizon and anchors long-horizon questions. */
export const LAYER_A_HORIZON_DAYS = 366;

/** Per-user snapshot cache lifetime (ms). Write actions should call `invalidateLayerACache`. */
export const LAYER_A_CACHE_TTL_MS = 60_000;

/** Upper bound on upcoming events serialised into Layer A. Keeps payload predictable. */
export const LAYER_A_MAX_UPCOMING_EVENTS = 50;

type CachedLayerA = { at: number; value: LayerA };
const cache = new Map<string, CachedLayerA>();

/**
 * Invalidate the cached Layer A for a single user. Wire this into write actions
 * (commitments, incomes, goals, skips, transactions) so the next Ask Keel request reads
 * fresh data.
 */
export function invalidateLayerACache(userId: string): void {
  cache.delete(userId);
}

/** Test-only helper — clears all cached snapshots. */
export function __resetLayerACacheForTests(): void {
  cache.clear();
}

// --- Pure projection helpers -------------------------------------------------

function minProjectionPoint(events: ProjectionEvent[], fallback: number): { value: number; date: string } {
  if (events.length === 0) return { value: fallback, date: "" };
  let min = events[0]!;
  for (const event of events) {
    if (event.projectedAvailableMoney < min.projectedAvailableMoney) {
      min = event;
    }
  }
  return { value: roundMoney(min.projectedAvailableMoney), date: min.date };
}

function maxProjectionPoint(events: ProjectionEvent[], fallback: number): { value: number; date: string } {
  if (events.length === 0) return { value: fallback, date: "" };
  let max = events[0]!;
  for (const event of events) {
    if (event.projectedAvailableMoney > max.projectedAvailableMoney) {
      max = event;
    }
  }
  return { value: roundMoney(max.projectedAvailableMoney), date: max.date };
}

function balanceAtOrBeforeDate(events: ProjectionEvent[], targetIso: string, fallback: number): number {
  let last: ProjectionEvent | null = null;
  for (const event of events) {
    if (event.date <= targetIso) last = event;
    else break;
  }
  return roundMoney(last?.projectedAvailableMoney ?? fallback);
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// --- Builder -----------------------------------------------------------------

/**
 * Builds the Layer A snapshot for the authenticated user, using the standard
 * `getProjectionEngineInput` pipeline. Caches per-user for 60s.
 *
 * @param userId The authenticated Supabase user id — used only as a cache key. The
 *               actual tenancy check happens inside {@link getProjectionEngineInput}.
 * @param asOf   Optional override; defaults to the user's `balanceAsOf` date.
 */
export async function buildLayerA(userId: string, asOf?: Date): Promise<LayerA> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && now - hit.at < LAYER_A_CACHE_TTL_MS) {
    return hit.value;
  }

  const [{ state, activeSkips }, wealth] = await Promise.all([
    getProjectionEngineInput(),
    getWealthSnapshot(),
  ]);

  const balanceAsOfIso = state.user.balanceAsOf;
  const asOfDate = asOf ?? new Date(`${balanceAsOfIso}T00:00:00Z`);
  const asOfIso = asOfDate.toISOString().slice(0, 10);

  const activeCommitments = state.commitments.filter((c) => !c.archivedAt);
  const activeIncomes = state.incomes.filter((i) => !i.archivedAt);

  const primaryIncome =
    activeIncomes.find((income) => income.id === state.primaryIncomeId) ?? activeIncomes[0] ?? null;

  // Goals are adjusted by goal skips before any engine math (mirrors keel-store).
  const goalsAdjusted: EngineGoal[] = state.goals.map((goal) =>
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
      { payFrequency: primaryIncome?.frequency },
    ),
  );

  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: state.user.bankBalance,
    incomes: activeIncomes,
    primaryIncomeId: state.primaryIncomeId,
    commitments: activeCommitments,
    goals: goalsAdjusted,
    asOf: asOfDate,
  });

  const engineIncomes: EngineIncome[] = activeIncomes.map((i) => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    frequency: i.frequency,
    nextPayDate: i.nextPayDate,
  }));
  const engineCommitments: EngineCommitment[] = activeCommitments.map((c) => ({
    id: c.id,
    name: c.name,
    amount: c.amount,
    frequency: c.frequency,
    nextDueDate: c.nextDueDate,
    fundedByIncomeId: c.fundedByIncomeId,
    category: c.category,
  }));

  const combinedSkips: SkipInput[] = [
    ...activeSkips.commitmentSkips,
    ...activeSkips.goalSkips,
    ...(activeSkips.incomeSkips ?? []),
  ];

  const events = buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf: asOfDate,
    horizonDays: LAYER_A_HORIZON_DAYS,
    incomes: engineIncomes,
    commitments: engineCommitments,
    skips: combinedSkips,
  });

  const startingBalance = availableMoneyResult.availableMoney;
  const minPoint = minProjectionPoint(events, startingBalance);
  const maxPoint = maxProjectionPoint(events, startingBalance);
  const horizonEndIso = addDaysIso(asOfIso, LAYER_A_HORIZON_DAYS);
  const oneYearOutIso = addDaysIso(asOfIso, 365);

  const reservedById = new Map(
    availableMoneyResult.commitmentReserves.map((r) => [r.id, r.reserved]),
  );

  const upcomingEvents = events.slice(0, LAYER_A_MAX_UPCOMING_EVENTS).map((event) => ({
    date: event.date,
    type: event.type,
    name: event.label,
    amount: roundMoney(event.amount),
    projectedAvailableMoney: roundMoney(event.projectedAvailableMoney),
    ...(event.isSkipped ? { isSkipped: true as const } : {}),
  }));

  const commitmentsById = new Map(activeCommitments.map((c) => [c.id, c.name]));
  const goalsById = new Map(state.goals.map((g) => [g.id, g.name]));
  const incomesById = new Map(activeIncomes.map((i) => [i.id, i.name]));

  const activeSkipsOut: LayerAActiveSkip[] = [
    ...activeSkips.commitmentSkips.map((skip) => ({
      kind: "commitment" as const,
      entityId: skip.commitmentId,
      entityName: commitmentsById.get(skip.commitmentId) ?? "Commitment",
      originalDate: skip.originalDateIso,
      strategy: skip.strategy,
    })),
    ...activeSkips.goalSkips.map((skip) => ({
      kind: "goal" as const,
      entityId: skip.goalId,
      entityName: goalsById.get(skip.goalId) ?? "Goal",
      originalDate: skip.originalDateIso,
      strategy: skip.strategy,
    })),
    ...(activeSkips.incomeSkips ?? []).map((skip) => ({
      kind: "income" as const,
      entityId: skip.incomeId,
      entityName: incomesById.get(skip.incomeId) ?? "Income",
      originalDate: skip.originalDateIso,
      strategy: skip.strategy,
    })),
  ];

  let annualIncomeTotal = 0;
  for (const i of activeIncomes) {
    annualIncomeTotal += annualizeAmount(i.amount, i.frequency as PayFrequency);
  }
  let annualCommitmentsTotal = 0;
  for (const c of activeCommitments) {
    annualCommitmentsTotal += annualizeAmount(c.amount, c.frequency as CommitmentFrequency);
  }

  const layerA: LayerA = {
    asOf: asOfDate.toISOString(),
    horizon: {
      start: asOfIso,
      end: horizonEndIso,
      days: LAYER_A_HORIZON_DAYS,
    },
    availableMoney: {
      now: roundMoney(availableMoneyResult.availableMoney),
      projectedMinOverHorizon: minPoint.value,
      projectedMinDate: minPoint.date || asOfIso,
      projectedMaxOverHorizon: maxPoint.value,
      projectedMaxDate: maxPoint.date || asOfIso,
      projectedAnnualEndBalance: balanceAtOrBeforeDate(events, oneYearOutIso, startingBalance),
    },
    annualTotals: {
      income: roundMoney(annualIncomeTotal),
      commitments: roundMoney(annualCommitmentsTotal),
    },
    incomes: activeIncomes.map((i) => ({
      id: i.id,
      name: i.name,
      amount: roundMoney(i.amount),
      frequency: i.frequency,
      nextPayDate: i.nextPayDate,
      isPrimary: i.id === state.primaryIncomeId,
    })),
    commitments: activeCommitments.map((c) => ({
      id: c.id,
      name: c.name,
      amount: roundMoney(c.amount),
      frequency: c.frequency,
      nextDueDate: c.nextDueDate,
      category: c.category,
      heldTowardNextDue: roundMoney(reservedById.get(c.id) ?? 0),
      ...(c.fundedByIncomeId ? { fundedByIncomeId: c.fundedByIncomeId } : {}),
    })),
    goals: goalsAdjusted.map((g) => ({
      id: g.id,
      name: g.name,
      contributionPerPay: roundMoney(g.contributionPerPay),
      currentBalance: roundMoney(g.currentBalance ?? 0),
      ...(g.targetAmount !== undefined ? { targetAmount: roundMoney(g.targetAmount) } : {}),
      ...(g.targetDate ? { targetDate: g.targetDate } : {}),
      ...(g.fundedByIncomeId ? { fundedByIncomeId: g.fundedByIncomeId } : {}),
    })),
    wealth: {
      totalValue: roundMoney(wealth.totalValue),
      accountCount: 0,
      holdingCount: wealth.holdings.length,
    },
    upcomingEvents,
    activeSkips: activeSkipsOut,
  };

  // Defence in depth — a subtle engine output could violate the schema.
  const validation = layerASchema.safeParse(layerA);
  if (!validation.success) {
    throw new Error(
      `[layer-a] Built snapshot failed schema validation: ${validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  cache.set(userId, { at: Date.now(), value: validation.data });
  return validation.data;
}
