/** Vitest: cashflow engine (`keel.ts`) — reserves, timelines, `availableMoneyAt`. */

import { describe, expect, it } from "vitest";

import {
  annualizeAmount,
  availableMoneyAt,
  buildProjectionTimeline,
  calculateAvailableMoney,
  calculateCommitmentReserve,
  calculatePerPayAmount,
  detectProjectedShortfall,
  getCurrentPayPeriod,
  isCommitmentInAttention,
  payPeriodsPerYear,
  type ProjectionEvent,
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

  it("processes same-day income before commitments", () => {
    const projection = buildProjectionTimeline({
      availableMoney: 500,
      asOf: new Date("2026-04-22T00:00:00Z"),
      horizonDays: 3,
      incomes: [
        {
          id: "inc1",
          name: "Salary",
          amount: 5000,
          frequency: "fortnightly",
          nextPayDate: "2026-04-23",
        },
      ],
      commitments: [
        {
          id: "com1",
          name: "Rent",
          amount: 3000,
          frequency: "fortnightly",
          nextDueDate: "2026-04-23",
          fundedByIncomeId: "inc1",
        },
      ],
    });

    const sameDay = projection.filter((e) => e.date === "2026-04-23");
    expect(sameDay).toHaveLength(2);

    // After 23 Apr both events process: 500 + 5000 - 3000 = 2500 (income must come first).
    expect(sameDay[0]?.type).toBe("income");
    expect(sameDay[sameDay.length - 1]?.projectedAvailableMoney).toBe(2500);
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

  // --- buildProjectionTimeline: startDate parameterization -------------------
  // The startDate parameter lets us load arbitrary chunks of the timeline (e.g., "give
  // me weeks 4-10 from today"). Running balances on returned events must already reflect
  // every event between asOf and startDate, so the first returned event's
  // projectedAvailableMoney is NOT the initial balance.

  // Regression guard: omitting startDate must produce the same events (and same running
  // balances) as the pre-refactor call shape.
  it("matches legacy behavior when startDate is omitted", () => {
    const legacy = buildProjectionTimeline({
      availableMoney: 1000,
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
      ],
    });

    const parameterized = buildProjectionTimeline({
      availableMoney: 1000,
      asOf: new Date("2026-04-20T00:00:00Z"),
      startDate: new Date("2026-04-20T00:00:00Z"),
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
      ],
    });

    expect(parameterized).toEqual(legacy);
  });

  // Loading a future chunk: startDate = asOf + 28 days, horizonDays = 28. Returned events
  // must fall inside [asOf+28, asOf+56], and the first event's running balance must
  // reflect the events from the first 28 days (i.e., NOT the initial balance).
  it("returns only events within the requested future chunk and preserves running balance", () => {
    const asOf = new Date("2026-04-20T00:00:00Z");
    const startDate = new Date("2026-05-18T00:00:00Z"); // asOf + 28 days

    const full = buildProjectionTimeline({
      availableMoney: 1000,
      asOf,
      horizonDays: 60,
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
      ],
    });

    const chunk = buildProjectionTimeline({
      availableMoney: 1000,
      asOf,
      startDate,
      horizonDays: 28,
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
      ],
    });

    for (const event of chunk) {
      expect(event.date >= "2026-05-18").toBe(true);
      expect(event.date <= "2026-06-15").toBe(true);
    }

    const lookup = new Map(full.map((event) => [event.id, event.projectedAvailableMoney]));
    for (const event of chunk) {
      expect(event.projectedAvailableMoney).toBe(lookup.get(event.id));
    }

    if (chunk[0]) {
      expect(chunk[0].projectedAvailableMoney).not.toBe(1000);
    }
  });

  // Loading a past chunk: startDate < asOf. No events exist before asOf (commitments are
  // anchored via nextDueDate), but the call should not crash and returned events should
  // have correct running balances computed from initialAvailableMoney going forward.
  it("tolerates startDate before asOf and returns forward-window events with correct balances", () => {
    const asOf = new Date("2026-04-20T00:00:00Z");
    const startDate = new Date("2026-04-06T00:00:00Z"); // asOf - 14 days

    const chunk = buildProjectionTimeline({
      availableMoney: 1000,
      asOf,
      startDate,
      horizonDays: 28,
      incomes: [income],
      commitments: [],
    });

    for (const event of chunk) {
      expect(event.date >= "2026-04-06").toBe(true);
      expect(event.date <= "2026-05-04").toBe(true);
    }

    expect(chunk[0]?.projectedAvailableMoney).toBe(
      chunk[0]?.type === "income" ? 1000 + chunk[0].amount : 1000,
    );
  });

  // Empty inputs & zero horizon — defensive guards.
  it("returns an empty array for empty income/commitment lists", () => {
    const chunk = buildProjectionTimeline({
      availableMoney: 500,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 42,
      incomes: [],
      commitments: [],
    });
    expect(chunk).toEqual([]);
  });

  it("returns an empty array when horizonDays is 0", () => {
    const chunk = buildProjectionTimeline({
      availableMoney: 500,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 0,
      incomes: [income],
      commitments: [],
    });
    expect(chunk).toEqual([]);
  });

  // --- availableMoneyAt ------------------------------------------------------

  function makeEvents(
    entries: Array<{ date: string; balance: number }>,
  ): ProjectionEvent[] {
    return entries.map((entry, index) => ({
      id: `event-${index}`,
      date: entry.date,
      label: `Event ${index}`,
      amount: 100,
      type: "income",
      projectedAvailableMoney: entry.balance,
    }));
  }

  // Before any event — returns the starting balance (nothing has happened yet).
  it("availableMoneyAt: returns starting balance when target is before all events", () => {
    const events = makeEvents([
      { date: "2026-05-01", balance: 1100 },
      { date: "2026-05-15", balance: 1300 },
    ]);
    expect(availableMoneyAt("2026-04-20", events, 1000)).toBe(1000);
  });

  // Exact match — inclusive; returns the event's own projected balance.
  it("availableMoneyAt: returns the event's balance when target equals its date", () => {
    const events = makeEvents([
      { date: "2026-05-01", balance: 1100 },
      { date: "2026-05-15", balance: 1300 },
    ]);
    expect(availableMoneyAt("2026-05-01", events, 1000)).toBe(1100);
  });

  // After all events — returns the last event's balance.
  it("availableMoneyAt: returns the last event's balance when target is after all events", () => {
    const events = makeEvents([
      { date: "2026-05-01", balance: 1100 },
      { date: "2026-05-15", balance: 1300 },
    ]);
    expect(availableMoneyAt("2026-06-01", events, 1000)).toBe(1300);
  });

  // Between events — step function, not interpolation. Returns the earlier event's balance.
  it("availableMoneyAt: returns the earlier event's balance when target is between two events", () => {
    const events = makeEvents([
      { date: "2026-05-01", balance: 1100 },
      { date: "2026-05-15", balance: 1300 },
    ]);
    expect(availableMoneyAt("2026-05-07", events, 1000)).toBe(1100);
  });

  // Empty events — fall back to starting balance.
  it("availableMoneyAt: returns starting balance for an empty events array", () => {
    expect(availableMoneyAt("2026-05-01", [], 2500)).toBe(2500);
  });

  // Accepts Date instances too.
  it("availableMoneyAt: accepts Date input (not just ISO string)", () => {
    const events = makeEvents([
      { date: "2026-05-01", balance: 1100 },
      { date: "2026-05-15", balance: 1300 },
    ]);
    expect(availableMoneyAt(new Date("2026-05-10T12:34:56Z"), events, 1000)).toBe(1100);
  });

  // Gesture-frame budget: 1000 lookups against a 100-event sorted array must complete
  // comfortably under 100ms on any machine that would run the dev server.
  it("availableMoneyAt: runs 1000 lookups over 100 events well under 100ms", () => {
    const events: ProjectionEvent[] = Array.from({ length: 100 }, (_, index) => ({
      id: `perf-${index}`,
      date: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
      label: `Perf ${index}`,
      amount: 100,
      type: "income",
      projectedAvailableMoney: 1000 + index,
    }));

    const target = new Date("2026-03-01T00:00:00Z");
    const start = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      availableMoneyAt(target, events, 1000);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
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

  it("applies income skip: no balance bump and isSkipped on that pay row", () => {
    const asOf = new Date("2026-04-20T00:00:00Z");
    const timeline = buildProjectionTimeline({
      availableMoney: 1000,
      asOf,
      horizonDays: 40,
      incomes: [income],
      commitments: [],
      skips: [
        { kind: "income", incomeId: income.id, originalDateIso: "2026-04-24", strategy: "STANDALONE" },
      ],
    });
    const skippedRow = timeline.find((e) => e.type === "income" && e.date === "2026-04-24");
    expect(skippedRow?.isSkipped).toBe(true);
    // Skipped pay adds no credit — balance stays at starting available until other flows move it.
    expect(skippedRow?.projectedAvailableMoney).toBe(1000);
  });

  it("moves a single commitment occurrence date while preserving recurrence identity", () => {
    const timeline = buildProjectionTimeline({
      availableMoney: 1000,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 60,
      incomes: [income],
      commitments: [
        {
          id: "c-rent",
          name: "Rent",
          amount: 1200,
          frequency: "monthly",
          nextDueDate: "2026-05-01",
          fundedByIncomeId: income.id,
        },
      ],
      occurrenceOverrides: [
        {
          kind: "commitment",
          sourceId: "c-rent",
          originalDateIso: "2026-05-01",
          scheduledDateIso: "2026-05-05",
        },
      ],
    });

    const moved = timeline.find((event) => event.id === "c-rent-2026-05-01");
    expect(moved).toBeDefined();
    expect(moved?.date).toBe("2026-05-05");
    expect(moved?.sourceKind).toBe("commitment");
    expect(moved?.sourceId).toBe("c-rent");
    expect(moved?.originalDateIso).toBe("2026-05-01");
  });

  it("applies an income skip to a moved income occurrence (keyed by original date)", () => {
    const timeline = buildProjectionTimeline({
      availableMoney: 1000,
      asOf: new Date("2026-04-20T00:00:00Z"),
      horizonDays: 20,
      incomes: [income],
      commitments: [],
      skips: [
        {
          kind: "income",
          incomeId: income.id,
          originalDateIso: "2026-04-24",
          strategy: "STANDALONE",
        },
      ],
      occurrenceOverrides: [
        {
          kind: "income",
          sourceId: income.id,
          originalDateIso: "2026-04-24",
          scheduledDateIso: "2026-04-26",
        },
      ],
    });

    const movedSkippedPay = timeline.find((event) => event.id === "income-income-salary-2026-04-24");
    expect(movedSkippedPay).toBeDefined();
    expect(movedSkippedPay?.date).toBe("2026-04-26");
    expect(movedSkippedPay?.isSkipped).toBe(true);
    expect(movedSkippedPay?.projectedAvailableMoney).toBe(1000);
  });
});
