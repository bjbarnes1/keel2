/**
 * Tests for the deterministic Layer B analyser.
 *
 * Targets the pure statistics functions (no Prisma). Each test shapes a small
 * transaction fixture, runs the relevant computation, and asserts the expected output.
 *
 * @module lib/ai/context/generators/analyze-patterns.test
 */

import { describe, expect, it } from "vitest";

import {
  MIN_MONTHS_FOR_DRIFT,
  computeCashflowTendencies,
  computeCategoryDrift,
  computeSeasonalVariance,
  sumOutflowsByCategoryMonth,
  type AnalyserCategory,
  type AnalyserCommitment,
  type AnalyserTransaction,
} from "./analyze-patterns";

function tx(postedOn: string, amount: number, categoryId: string | null): AnalyserTransaction {
  return {
    postedOn: new Date(`${postedOn}T00:00:00.000Z`),
    amount,
    categoryId,
  };
}

describe("sumOutflowsByCategoryMonth", () => {
  it("groups by category and month and ignores inflows", () => {
    const out = sumOutflowsByCategoryMonth([
      tx("2026-01-10", -100, "cat_1"),
      tx("2026-01-25", -50, "cat_1"),
      tx("2026-02-01", -200, "cat_1"),
      tx("2026-02-15", +1000, "cat_1"), // inflow — skipped
    ]);
    const forCat1 = out.get("cat_1")!;
    expect(forCat1.get("2026-01")).toBe(150);
    expect(forCat1.get("2026-02")).toBe(200);
  });

  it("ignores transactions without a category", () => {
    const out = sumOutflowsByCategoryMonth([tx("2026-01-01", -100, null)]);
    expect(out.size).toBe(0);
  });
});

describe("computeCategoryDrift", () => {
  const categories: AnalyserCategory[] = [
    { id: "cat_groceries", name: "Groceries" },
    { id: "cat_utilities", name: "Utilities" },
  ];
  const commitments: AnalyserCommitment[] = [
    { id: "c1", amount: 400, frequency: "monthly", categoryId: "cat_groceries" },
    { id: "c2", amount: 200, frequency: "monthly", categoryId: "cat_utilities" },
  ];

  it("flags over-budget categories with a positive drift percent", () => {
    const transactions: AnalyserTransaction[] = [];
    // 6 months of groceries at $500/month (25% over the $400 budget)
    for (let m = 1; m <= 6; m++) {
      const month = String(m).padStart(2, "0");
      transactions.push(tx(`2026-${month}-10`, -500, "cat_groceries"));
    }

    const drift = computeCategoryDrift(transactions, commitments, categories);
    const groceries = drift.find((d) => d.categoryId === "cat_groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.driftPercent).toBeCloseTo(25, 0);
    expect(groceries!.confidence).toBe("high");
  });

  it("degrades confidence when observed months is below the minimum", () => {
    const transactions: AnalyserTransaction[] = [
      tx("2026-01-10", -500, "cat_groceries"),
    ];
    const drift = computeCategoryDrift(transactions, commitments, categories);
    const groceries = drift.find((d) => d.categoryId === "cat_groceries")!;
    expect(groceries.monthsObserved).toBe(1);
    expect(groceries.confidence).toBe("low");
    expect(groceries.monthsObserved).toBeLessThan(MIN_MONTHS_FOR_DRIFT);
  });

  it("skips categories with no budget", () => {
    const unbudgetedCats: AnalyserCategory[] = [{ id: "cat_fun", name: "Fun" }];
    const transactions: AnalyserTransaction[] = [tx("2026-01-10", -100, "cat_fun")];
    expect(computeCategoryDrift(transactions, commitments, unbudgetedCats)).toHaveLength(0);
  });
});

describe("computeSeasonalVariance", () => {
  const categories: AnalyserCategory[] = [{ id: "cat_power", name: "Power" }];

  it("detects a winter peak", () => {
    const transactions: AnalyserTransaction[] = [];
    // Build 12 months of data with peaks in June/July/August.
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, "0");
      const peak = m >= 6 && m <= 8 ? -400 : -100;
      transactions.push(tx(`2026-${month}-15`, peak, "cat_power"));
    }
    const variance = computeSeasonalVariance(transactions, categories);
    expect(variance).toHaveLength(1);
    expect(variance[0]!.highMonths).toEqual([6, 7, 8]);
    expect(variance[0]!.highMonthMultiplier).toBeGreaterThan(1.2);
  });

  it("returns empty when data is below the minimum", () => {
    const transactions: AnalyserTransaction[] = [];
    for (let m = 1; m <= 6; m++) {
      const month = String(m).padStart(2, "0");
      transactions.push(tx(`2026-${month}-15`, -100, "cat_power"));
    }
    expect(computeSeasonalVariance(transactions, categories)).toHaveLength(0);
  });
});

describe("computeCashflowTendencies", () => {
  it("computes the average monthly remaining across six full cycles", () => {
    const transactions: AnalyserTransaction[] = [];
    for (let m = 1; m <= 6; m++) {
      const month = String(m).padStart(2, "0");
      transactions.push(tx(`2026-${month}-01`, 5000, "cat_income"));
      transactions.push(tx(`2026-${month}-15`, -4000, "cat_spend"));
    }
    const result = computeCashflowTendencies(transactions);
    expect(result.typicalEndOfCycleRemaining).toBeCloseTo(1000, 0);
    expect(result.confidence).toBe("medium");
  });

  it("returns low-confidence zeros for sparse data", () => {
    const result = computeCashflowTendencies([]);
    expect(result.typicalEndOfCycleRemaining).toBe(0);
    expect(result.confidence).toBe("low");
  });
});
