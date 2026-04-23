/**
 * Layer B analyser — produces `LearnedPatterns` deterministically from a user's
 * transaction history and their commitments. **No LLM calls.**
 *
 * Runs on a scheduled cadence (weekly is plenty). Between runs, Layer B is
 * intentionally stale — a week of lag on behavioural signals is fine.
 *
 * **Thresholds:** minimum data bars are set low enough that seeded test accounts can
 * exercise the code path but high enough that real users without history get honest
 * empty defaults instead of noise:
 *   - Category drift: ≥ 3 months of data per category (else confidence degrades)
 *   - Seasonal variance: ≥ 12 months (else empty)
 *   - Cashflow tendencies: ≥ 6 pay cycles worth of transactions (else zeros)
 *
 * @module lib/ai/context/generators/analyze-patterns
 */

import type { PrismaClient } from "@prisma/client";

import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentFrequency } from "@/lib/types";

import {
  learnedPatternsSchema,
  EMPTY_LEARNED_PATTERNS,
  type LearnedPatterns,
} from "../schemas/layer-b-schema";

export const ANALYSIS_VERSION = "2026.04.v1";

/** Minimum months before category drift is surfaced with > 'low' confidence. */
export const MIN_MONTHS_FOR_DRIFT = 3;
/** Minimum months needed before seasonal variance is computed at all. */
export const MIN_MONTHS_FOR_SEASONAL = 12;
/** Minimum pay cycles before cashflow tendencies carry > 'low' confidence. */
export const MIN_CYCLES_FOR_TENDENCIES = 6;
/** Hard cap on months of history pulled back for analysis. */
export const ANALYSIS_LOOKBACK_MONTHS = 12;

// --- Small shape helpers ----------------------------------------------------

/** Shape returned from Prisma that the analyser actually uses. */
export type AnalyserTransaction = {
  postedOn: Date;
  amount: number;
  categoryId: string | null;
};

export type AnalyserCommitment = {
  id: string;
  amount: number;
  frequency: CommitmentFrequency;
  categoryId: string;
};

export type AnalyserCategory = {
  id: string;
  name: string;
};

// --- Pure statistics ---------------------------------------------------------

/**
 * Groups transactions by category and month, returning absolute-dollar sums.
 *
 * The analyser only cares about outflows (amount < 0). Income rows and transfers carry
 * positive amounts and are intentionally excluded — Layer B models *spending* patterns,
 * not inflow patterns.
 */
export function sumOutflowsByCategoryMonth(
  transactions: AnalyserTransaction[],
): Map<string, Map<string, number>> {
  const byCategory = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    if (tx.amount >= 0) continue; // inflows skipped
    const monthKey = `${tx.postedOn.getUTCFullYear()}-${String(
      tx.postedOn.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    let byMonth = byCategory.get(tx.categoryId);
    if (!byMonth) {
      byMonth = new Map<string, number>();
      byCategory.set(tx.categoryId, byMonth);
    }
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + Math.abs(tx.amount));
  }
  return byCategory;
}

/** Deterministic monthly budget for a category based on commitments that map to it. */
export function monthlyBudgetForCategory(
  commitments: AnalyserCommitment[],
  categoryId: string,
): number {
  let annual = 0;
  for (const c of commitments) {
    if (c.categoryId === categoryId) {
      annual += annualizeAmount(c.amount, c.frequency);
    }
  }
  return annual / 12;
}

function pickConfidenceForMonths(months: number): LearnedPatterns["categoryDrift"][number]["confidence"] {
  if (months >= 6) return "high";
  if (months >= MIN_MONTHS_FOR_DRIFT) return "medium";
  return "low";
}

/**
 * Computes category drift — actual monthly spend vs. budgeted monthly equivalent. Positive
 * drift = over budget. Categories with no budget are skipped (no signal without a baseline).
 */
export function computeCategoryDrift(
  transactions: AnalyserTransaction[],
  commitments: AnalyserCommitment[],
  categories: AnalyserCategory[],
): LearnedPatterns["categoryDrift"] {
  const byCategory = sumOutflowsByCategoryMonth(transactions);
  const out: LearnedPatterns["categoryDrift"] = [];

  for (const category of categories) {
    const byMonth = byCategory.get(category.id);
    if (!byMonth || byMonth.size === 0) continue;

    const budgetedMonthly = monthlyBudgetForCategory(commitments, category.id);
    if (budgetedMonthly <= 0) continue;

    const monthlyTotals = [...byMonth.values()];
    const avg = monthlyTotals.reduce((sum, v) => sum + v, 0) / monthlyTotals.length;
    const driftPercent = ((avg - budgetedMonthly) / budgetedMonthly) * 100;

    out.push({
      categoryId: category.id,
      categoryName: category.name,
      budgetedMonthly: roundTo2(budgetedMonthly),
      actualMonthlyAverage: roundTo2(avg),
      driftPercent: roundTo2(driftPercent),
      confidence: pickConfidenceForMonths(monthlyTotals.length),
      monthsObserved: monthlyTotals.length,
    });
  }

  // Stable order by drift magnitude (biggest over-spend first) for the prompt.
  out.sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));
  return out;
}

/**
 * Detects seasonal variance per category — the months that tend to run high vs. low
 * relative to the category's own annual mean. Requires a full 12 months of data per
 * category; anything less returns nothing (confidence would be uselessly noisy).
 */
export function computeSeasonalVariance(
  transactions: AnalyserTransaction[],
  categories: AnalyserCategory[],
): LearnedPatterns["seasonalVariance"] {
  const byCategory = sumOutflowsByCategoryMonth(transactions);
  const out: LearnedPatterns["seasonalVariance"] = [];

  for (const category of categories) {
    const byMonth = byCategory.get(category.id);
    if (!byMonth || byMonth.size < MIN_MONTHS_FOR_SEASONAL) continue;

    const perCalendarMonth = new Array<number>(12).fill(0);
    const perCalendarMonthCount = new Array<number>(12).fill(0);
    for (const [monthKey, total] of byMonth.entries()) {
      const parts = monthKey.split("-");
      if (parts.length !== 2) continue;
      const mIndex = Number(parts[1]) - 1;
      if (Number.isNaN(mIndex) || mIndex < 0 || mIndex > 11) continue;
      perCalendarMonth[mIndex]! += total;
      perCalendarMonthCount[mIndex]! += 1;
    }

    const averages: number[] = [];
    for (let i = 0; i < 12; i++) {
      averages.push(
        perCalendarMonthCount[i]! > 0 ? perCalendarMonth[i]! / perCalendarMonthCount[i]! : 0,
      );
    }
    const overallAvg = averages.reduce((sum, v) => sum + v, 0) / 12;
    if (overallAvg <= 0) continue;

    const highs: number[] = [];
    const lows: number[] = [];
    let highMultiplierMax = 1;
    let lowMultiplierMin = 1;

    for (let i = 0; i < 12; i++) {
      const avg = averages[i]!;
      if (avg === 0) continue;
      const ratio = avg / overallAvg;
      if (ratio >= 1.2) {
        highs.push(i + 1);
        if (ratio > highMultiplierMax) highMultiplierMax = ratio;
      } else if (ratio <= 0.8) {
        lows.push(i + 1);
        if (ratio < lowMultiplierMin) lowMultiplierMin = ratio;
      }
    }

    if (highs.length === 0 && lows.length === 0) continue;

    out.push({
      categoryId: category.id,
      categoryName: category.name,
      highMonths: highs,
      highMonthMultiplier: roundTo2(highMultiplierMax),
      lowMonths: lows,
      lowMonthMultiplier: roundTo2(lowMultiplierMin),
      confidence: byMonth.size >= 18 ? "high" : "medium",
    });
  }

  return out;
}

/**
 * Computes cashflow tendencies — the user's typical end-of-cycle buffer and the
 * consistency of that buffer. Operates on transaction aggregates; commitments parameterise
 * the cycle length but are otherwise not needed here.
 */
export function computeCashflowTendencies(
  transactions: AnalyserTransaction[],
): LearnedPatterns["cashflowTendencies"] {
  // We estimate cycles by month slice; close-enough for Layer B signal purposes.
  const perMonth = new Map<string, { inflow: number; outflow: number }>();
  for (const tx of transactions) {
    const monthKey = `${tx.postedOn.getUTCFullYear()}-${String(
      tx.postedOn.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const bucket = perMonth.get(monthKey) ?? { inflow: 0, outflow: 0 };
    if (tx.amount > 0) bucket.inflow += tx.amount;
    else bucket.outflow += Math.abs(tx.amount);
    perMonth.set(monthKey, bucket);
  }

  const sortedKeys = [...perMonth.keys()].sort();
  const recent = sortedKeys.slice(-MIN_CYCLES_FOR_TENDENCIES);
  const remainings: number[] = [];
  for (const key of recent) {
    const bucket = perMonth.get(key)!;
    remainings.push(bucket.inflow - bucket.outflow);
  }

  if (remainings.length === 0) {
    return { ...EMPTY_LEARNED_PATTERNS.cashflowTendencies };
  }

  const avg = remainings.reduce((sum, v) => sum + v, 0) / remainings.length;
  const variance =
    remainings.reduce((sum, v) => sum + (v - avg) ** 2, 0) / remainings.length;
  const stdDev = Math.sqrt(variance);
  const variancePct = avg !== 0 ? (stdDev / Math.abs(avg)) * 100 : 0;

  return {
    typicalEndOfCycleRemaining: roundTo2(avg),
    variancePctOverLast6Cycles: roundTo2(variancePct),
    skipCommitmentsPerQuarter: 0, // Populated by the Prisma loader; not a transaction signal.
    confidence: remainings.length >= MIN_CYCLES_FOR_TENDENCIES ? "medium" : "low",
  };
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- Orchestrator ------------------------------------------------------------

/**
 * Top-level analyser. Pulls the last 12 months of data from Prisma, aggregates
 * deterministically, and returns a Zod-validated `LearnedPatterns` object. Never calls an
 * LLM; caller decides where to persist the result.
 */
export async function analyzePatternsForBudget(
  prisma: PrismaClient,
  budgetId: string,
  now: Date = new Date(),
): Promise<LearnedPatterns> {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - ANALYSIS_LOOKBACK_MONTHS);

  const [transactionsRaw, commitmentsRaw, categoriesRaw, skipCountRaw] = await Promise.all([
    prisma.spendTransaction.findMany({
      where: { budgetId, postedOn: { gte: since } },
      select: { postedOn: true, amount: true, categoryId: true },
    }),
    prisma.commitment.findMany({
      where: { budgetId, archivedAt: null },
      select: { id: true, amount: true, frequency: true, categoryId: true },
    }),
    prisma.category.findMany({
      where: { budgetId },
      select: { id: true, name: true },
    }),
    prisma.commitmentSkip.count({
      where: { budgetId, revokedAt: null, createdAt: { gte: since } },
    }),
  ]);

  const transactions: AnalyserTransaction[] = transactionsRaw.map((t) => ({
    postedOn: t.postedOn,
    amount: Number(t.amount),
    categoryId: t.categoryId,
  }));
  const commitments: AnalyserCommitment[] = commitmentsRaw.map((c) => ({
    id: c.id,
    amount: Number(c.amount),
    frequency: c.frequency as CommitmentFrequency,
    categoryId: c.categoryId,
  }));
  const categories: AnalyserCategory[] = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const cashflow = computeCashflowTendencies(transactions);
  cashflow.skipCommitmentsPerQuarter = roundTo2((skipCountRaw / ANALYSIS_LOOKBACK_MONTHS) * 3);

  const patterns: LearnedPatterns = {
    categoryDrift: computeCategoryDrift(transactions, commitments, categories),
    seasonalVariance: computeSeasonalVariance(transactions, categories),
    cashflowTendencies: cashflow,
    meta: {
      totalTransactionsAnalyzed: transactions.length,
      analysisVersion: ANALYSIS_VERSION,
    },
  };

  const validation = learnedPatternsSchema.safeParse(patterns);
  if (!validation.success) {
    throw new Error(
      `[layer-b] Analyser output failed schema validation: ${validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return validation.data;
}
