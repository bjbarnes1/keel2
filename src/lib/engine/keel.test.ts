import { describe, expect, it } from "vitest";

import {
  annualizeAmount,
  buildProjectionTimeline,
  calculateAvailableMoney,
  calculateCommitmentReserve,
  calculatePerPayAmount,
  detectProjectedShortfall,
  payPeriodsPerYear,
} from "@/lib/engine/keel";

const income = {
  name: "Salary",
  amount: 4200,
  frequency: "fortnightly" as const,
  nextPayDate: "2026-04-24",
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
      },
      income,
      new Date("2026-05-01T00:00:00Z"),
    );

    expect(reserve.perPay).toBe(73.85);
    expect(reserve.reserved).toBeCloseTo(245.22, 2);
    expect(reserve.percentFunded).toBe(51);
  });

  it("calculates available money from bank balance, reserves, and goals", () => {
    const result = calculateAvailableMoney({
      bankBalance: 6000,
      income,
      asOf: new Date("2026-05-01T00:00:00Z"),
      commitments: [
        {
          id: "mortgage",
          name: "Mortgage",
          amount: 2400,
          frequency: "monthly",
          nextDueDate: "2026-05-15",
        },
      ],
      goals: [
        {
          id: "holiday",
          name: "Holiday",
          contributionPerPay: 150,
        },
      ],
    });

    expect(result.totalGoalContributions).toBe(150);
    expect(result.totalReserved).toBeCloseTo(1280, 0);
    expect(result.availableMoney).toBeCloseTo(4570, 0);
  });

  it("projects events forward and detects a shortfall", () => {
    const projection = buildProjectionTimeline({
      availableMoney: -3500,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 45,
      income,
      commitments: [
        {
          id: "rent",
          name: "Rent",
          amount: 1200,
          frequency: "monthly",
          nextDueDate: "2026-05-01",
        },
        {
          id: "insurance",
          name: "Insurance",
          amount: 900,
          frequency: "monthly",
          nextDueDate: "2026-05-10",
        },
      ],
    });

    expect(projection.length).toBeGreaterThan(3);
    expect(projection[0]?.label).toBe("Salary");
    expect(detectProjectedShortfall(projection)?.label).toBe("Rent");
  });
});
