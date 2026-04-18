import { describe, expect, it } from "vitest";

import {
  annualizeAmount,
  buildProjectionTimeline,
  calculateAvailableMoney,
  calculateCommitmentReserve,
  calculatePerPayAmount,
  detectProjectedShortfall,
  getCurrentPayPeriod,
  isCommitmentInAttention,
  payPeriodsPerYear,
} from "@/lib/engine/keel";

const income = {
  id: "income-salary",
  name: "Salary",
  amount: 4200,
  frequency: "fortnightly" as const,
  nextPayDate: "2026-04-24",
};

const partnerIncome = {
  id: "income-partner",
  name: "Partner",
  amount: 1200,
  frequency: "weekly" as const,
  nextPayDate: "2026-04-22",
};

describe("keel engine", () => {
  it("annualizes commitment amounts correctly", () => {
    expect(annualizeAmount(100, "monthly")).toBe(1200);
    expect(annualizeAmount(480, "quarterly")).toBe(1920);
    expect(annualizeAmount(2400, "annual")).toBe(2400);
  });

  it("calculates pay periods per year", () => {
    expect(payPeriodsPerYear("weekly")).toBe(52);
    expect(payPeriodsPerYear("fortnightly")).toBe(26);
    expect(payPeriodsPerYear("monthly")).toBe(12);
  });

  it("calculates per-pay contributions for infrequent bills", () => {
    expect(calculatePerPayAmount(480, "quarterly", "fortnightly")).toBe(73.85);
    expect(calculatePerPayAmount(2400, "annual", "monthly")).toBe(200);
  });

  it("calculates a quarterly reserve based on cycle progress", () => {
    const reserve = calculateCommitmentReserve(
      {
        id: "car-insurance",
        name: "Car Insurance",
        amount: 480,
        frequency: "quarterly",
        nextDueDate: "2026-06-15",
        fundedByIncomeId: income.id,
      },
      [income],
      income.id,
      new Date("2026-05-01T00:00:00Z"),
    );

    expect(reserve.perPay).toBe(73.85);
    expect(reserve.reserved).toBeCloseTo(245.22, 2);
    expect(reserve.percentFunded).toBe(51);
  });

  it("calculates available money from bank balance, reserves, and goals", () => {
    const result = calculateAvailableMoney({
      bankBalance: 6000,
      incomes: [income],
      primaryIncomeId: income.id,
      asOf: new Date("2026-05-01T00:00:00Z"),
      commitments: [
        {
          id: "mortgage",
          name: "Mortgage",
          amount: 2400,
          frequency: "monthly",
          nextDueDate: "2026-05-15",
          fundedByIncomeId: income.id,
        },
      ],
      goals: [
        {
          id: "holiday",
          name: "Holiday",
          contributionPerPay: 150,
          fundedByIncomeId: income.id,
        },
      ],
    });

    // In the multi-income model goal contributions are normalized to a weekly equivalent.
    // Fortnightly 150/pay => 150 * 26 / 52 = 75/week.
    expect(result.totalGoalContributions).toBe(75);
    expect(result.totalReserved).toBeCloseTo(1280, 0);
    expect(result.availableMoney).toBeCloseTo(4645, 0);
  });

  it("projects events forward and detects a shortfall", () => {
    const projection = buildProjectionTimeline({
      availableMoney: -3500,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 45,
      incomes: [income],
      commitments: [
        {
          id: "rent",
          name: "Rent",
          amount: 1200,
          frequency: "monthly",
          nextDueDate: "2026-05-01",
          fundedByIncomeId: income.id,
        },
        {
          id: "insurance",
          name: "Insurance",
          amount: 900,
          frequency: "monthly",
          nextDueDate: "2026-05-10",
          fundedByIncomeId: income.id,
        },
      ],
    });

    expect(projection.length).toBeGreaterThan(3);
    expect(projection[0]?.label).toBe("Salary");
    expect(detectProjectedShortfall(projection)?.label).toBe("Rent");
  });

  it("uses the linked income cadence for per-pay amounts", () => {
    const weeklyBill = calculateCommitmentReserve(
      {
        id: "council-rates",
        name: "Council Rates",
        amount: 1200,
        frequency: "annual",
        nextDueDate: "2026-08-01",
        fundedByIncomeId: partnerIncome.id,
      },
      [income, partnerIncome],
      income.id,
      new Date("2026-05-01T00:00:00Z"),
    );

    const fortnightlyBill = calculateCommitmentReserve(
      {
        id: "council-rates-2",
        name: "Council Rates",
        amount: 1200,
        frequency: "annual",
        nextDueDate: "2026-08-01",
        fundedByIncomeId: income.id,
      },
      [income, partnerIncome],
      income.id,
      new Date("2026-05-01T00:00:00Z"),
    );

    expect(weeklyBill.perPay).toBe(23.08);
    expect(fortnightlyBill.perPay).toBe(46.15);
  });

  it("normalizes mixed goal cadences into a combined weekly equivalent", () => {
    const result = calculateAvailableMoney({
      bankBalance: 1000,
      incomes: [income, partnerIncome],
      primaryIncomeId: income.id,
      asOf: new Date("2026-05-01T00:00:00Z"),
      commitments: [],
      goals: [
        { id: "g1", name: "Holiday", contributionPerPay: 150, fundedByIncomeId: income.id },
        { id: "g2", name: "Kids", contributionPerPay: 50, fundedByIncomeId: partnerIncome.id },
      ],
    });

    // Fortnightly 150 => 75/week; Weekly 50 => 50/week; total = 125/week.
    expect(result.totalGoalContributions).toBe(125);
  });

  it("merges multiple income streams into the projection timeline", () => {
    const projection = buildProjectionTimeline({
      availableMoney: 0,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 10,
      incomes: [income, partnerIncome],
      commitments: [],
    });

    expect(projection.some((event) => event.type === "income" && event.label === "Salary")).toBe(
      true,
    );
    expect(
      projection.some((event) => event.type === "income" && event.label === "Partner"),
    ).toBe(true);
  });

  it("computes a pay-aligned fortnightly pay period window", () => {
    const period = getCurrentPayPeriod(income, new Date("2026-04-20T00:00:00Z"));

    expect(period.start.toISOString().slice(0, 10)).toBe("2026-04-10");
    expect(period.end.toISOString().slice(0, 10)).toBe("2026-04-23");
    expect(period.dayIndex).toBe(11);
    expect(period.totalDays).toBe(14);
  });

  it("falls back to calendar fortnights when no primary income exists", () => {
    const period = getCurrentPayPeriod(null, new Date("2026-04-20T00:00:00Z"));

    expect(period.totalDays).toBe(14);
    expect(period.dayIndex).toBeGreaterThanOrEqual(1);
    expect(period.dayIndex).toBeLessThanOrEqual(14);
  });

  it("flags attention when a commitment cannot fully fund before pay day", () => {
    const payPeriod = getCurrentPayPeriod(income, new Date("2026-04-20T00:00:00Z"));
    const reserve = calculateCommitmentReserve(
      {
        id: "insurance",
        name: "Insurance",
        amount: 50,
        frequency: "weekly",
        nextDueDate: "2026-04-22",
        fundedByIncomeId: income.id,
      },
      [income],
      income.id,
      new Date("2026-04-20T00:00:00Z"),
    );

    expect(
      isCommitmentInAttention({
        commitment: reserve,
        payPeriod,
        asOf: new Date("2026-04-20T00:00:00Z"),
      }),
    ).toBe(true);
  });
});
