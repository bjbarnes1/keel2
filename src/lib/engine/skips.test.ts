/** Vitest: skip strategies and cashflow mutation (`skips.ts`). */

import { describe, expect, it } from "vitest";

import { buildTimelineForTest } from "@/lib/engine/keel";

import {
  applyGoalSkipsToGoal,
  applySkipsToEvents,
  billEventId,
  commitmentSkipDisplayIndex,
  parseBillEventCommitmentId,
  previewSkipImpact,
} from "./skips";

const baseIncome = {
  id: "inc",
  name: "Pay",
  amount: 2000,
  frequency: "fortnightly" as const,
  nextPayDate: "2026-04-20",
};

const baseCommitment = {
  id: "cmtid0123456789abcdef",
  name: "Rent",
  amount: 500,
  frequency: "fortnightly" as const,
  nextDueDate: "2026-04-18",
};

function baselineEvents() {
  return [
    { id: "income-inc-2026-04-20", date: "2026-04-20", label: "Pay", amount: 2000, type: "income" as const },
    {
      id: billEventId(baseCommitment.id, "2026-04-18"),
      date: "2026-04-18",
      label: "Rent",
      amount: 500,
      type: "bill" as const,
    },
    {
      id: billEventId(baseCommitment.id, "2026-05-02"),
      date: "2026-05-02",
      label: "Rent",
      amount: 500,
      type: "bill" as const,
    },
    {
      id: billEventId(baseCommitment.id, "2026-05-16"),
      date: "2026-05-16",
      label: "Rent",
      amount: 500,
      type: "bill" as const,
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

describe("parseBillEventCommitmentId", () => {
  it("parses slug and uuid-style commitment ids", () => {
    expect(parseBillEventCommitmentId(billEventId("mortgage", "2026-01-15"))).toBe("mortgage");
    const uuidLike = "4b44aad3-8af6-43c4-a3d2-643e79c0d66e";
    expect(parseBillEventCommitmentId(billEventId(uuidLike, "2026-01-15"))).toBe(uuidLike);
  });
});

describe("applySkipsToEvents", () => {
  it("STANDALONE removes skipped bill with no redistribution", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
    ]);
    const byId = new Map(out.map((event) => [event.id, event]));
    expect(byId.has(billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
    expect(byId.get(billEventId(baseCommitment.id, "2026-05-02"))?.amount).toBe(500);
    expect(byId.get(billEventId(baseCommitment.id, "2026-05-16"))?.amount).toBe(500);
  });

  it("MAKE_UP_NEXT removes skipped row and adds amount to next bill", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    ]);
    const byId = new Map(out.map((event) => [event.id, event]));
    expect(byId.has(billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
    expect(byId.get(billEventId(baseCommitment.id, "2026-05-02"))?.amount).toBe(1000);
  });

  it("MOVE_ON removes bill entirely", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MOVE_ON",
      },
    ]);
    expect(out.some((event) => event.id === billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
  });

  it("applies STANDALONE on multiple commitments independently", () => {
    const c2 = { ...baseCommitment, id: "c2", name: "Phone" };
    const events = [
      ...baselineEvents(),
      {
        id: billEventId(c2.id, "2026-04-18"),
        date: "2026-04-18",
        label: c2.name,
        amount: 60,
        type: "bill" as const,
      },
      {
        id: billEventId(c2.id, "2026-05-02"),
        date: "2026-05-02",
        label: c2.name,
        amount: 60,
        type: "bill" as const,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));

    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
      {
        kind: "commitment",
        commitmentId: c2.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
    ]);

    expect(out.some((e) => e.id === billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
    expect(out.some((e) => e.id === billEventId(c2.id, "2026-04-18"))).toBe(false);
    expect(out.find((e) => e.id === billEventId(c2.id, "2026-05-02"))?.amount).toBe(60);
  });

  it("STANDALONE and MAKE_UP_NEXT can coexist for different commitments", () => {
    const c2 = { ...baseCommitment, id: "c3", name: "Gym" };
    const events = [
      ...baselineEvents(),
      {
        id: billEventId(c2.id, "2026-04-18"),
        date: "2026-04-18",
        label: c2.name,
        amount: 40,
        type: "bill" as const,
      },
      {
        id: billEventId(c2.id, "2026-05-02"),
        date: "2026-05-02",
        label: c2.name,
        amount: 40,
        type: "bill" as const,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));

    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
      {
        kind: "commitment",
        commitmentId: c2.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    ]);

    expect(out.some((e) => e.id === billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
    expect(out.find((e) => e.id === billEventId(c2.id, "2026-05-02"))?.amount).toBe(80);
  });

  it("SPREAD distributes across next N bills", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "SPREAD",
        spreadOverN: 2,
      },
    ]);
    const may2 = out.find((event) => event.id === billEventId(baseCommitment.id, "2026-05-02"))?.amount;
    const may16 = out.find((event) => event.id === billEventId(baseCommitment.id, "2026-05-16"))?.amount;
    expect(may2).toBe(750);
    expect(may16).toBe(750);
  });

  it("SPREAD preserves total skipped cents across three recipients (penny rounding)", () => {
    const cId = "penny";
    const events = [
      { id: "income-inc-2026-04-20", date: "2026-04-20", label: "Pay", amount: 2000, type: "income" as const },
      { id: billEventId(cId, "2026-04-18"), date: "2026-04-18", label: "Odd", amount: 10.01, type: "bill" as const },
      { id: billEventId(cId, "2026-05-02"), date: "2026-05-02", label: "Odd", amount: 10, type: "bill" as const },
      { id: billEventId(cId, "2026-05-16"), date: "2026-05-16", label: "Odd", amount: 10, type: "bill" as const },
      { id: billEventId(cId, "2026-05-30"), date: "2026-05-30", label: "Odd", amount: 10, type: "bill" as const },
    ];
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: cId,
        originalDateIso: "2026-04-18",
        strategy: "SPREAD",
        spreadOverN: 3,
      },
    ]);
    const recipients = ["2026-05-02", "2026-05-16", "2026-05-30"].map((d) =>
      out.find((event) => event.id === billEventId(cId, d)),
    );
    const extra = recipients.reduce((sum, row) => sum + ((row?.amount ?? 0) - 10), 0);
    expect(extra).toBeCloseTo(10.01, 2);
  });

  it("applies multiple commitment skips in date order", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-05-16",
        strategy: "MOVE_ON",
      },
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    ]);
    expect(out.some((event) => event.id === billEventId(baseCommitment.id, "2026-04-18"))).toBe(false);
    expect(out.some((event) => event.id === billEventId(baseCommitment.id, "2026-05-16"))).toBe(false);
    const bumped = out.find((event) => event.id === billEventId(baseCommitment.id, "2026-05-02"))?.amount;
    expect(bumped).toBe(1000);
  });

  it("ignores skip when bill occurrence missing", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2030-01-01",
        strategy: "MAKE_UP_NEXT",
      },
    ]);
    expect(out.length).toBe(events.length);
  });

  it("ignores goal-only skips", () => {
    const events = baselineEvents();
    const out = applySkipsToEvents(events, [
      {
        kind: "goal",
        goalId: "g1",
        originalDateIso: "2026-04-18",
        strategy: "EXTEND_DATE",
      },
    ]);
    expect(out).toEqual(events);
  });
});

describe("previewSkipImpact", () => {
  it("reports positive delta for MOVE_ON vs raw baseline", () => {
    const ordered = baselineEvents().sort((a, b) => a.date.localeCompare(b.date));
    const preview = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 1000,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MOVE_ON",
      },
    });
    expect(preview.endAvailableMoneyDelta).toBe(500);
  });

  it("reports the skipped amount delta for STANDALONE", () => {
    const ordered = baselineEvents().sort((a, b) => a.date.localeCompare(b.date));
    const preview = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 1000,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
    });
    expect(preview.endAvailableMoneyDelta).toBe(500);
  });

  it("stacks hypothetical skip on existing commitment skips", () => {
    const ordered = baselineEvents().sort((a, b) => a.date.localeCompare(b.date));
    const existing = [
      {
        kind: "commitment" as const,
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-05-02",
        strategy: "MOVE_ON" as const,
      },
    ];
    const withExistingOnly = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 1000,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
      existingCommitmentSkips: existing,
    });
    const fresh = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 1000,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    });
    expect(withExistingOnly.endAvailableMoneyDelta).not.toBe(fresh.endAvailableMoneyDelta);
  });

  it("MAKE_UP_NEXT preview matches stacked apply when no future bill exists", () => {
    const ordered = [
      {
        id: billEventId(baseCommitment.id, "2026-04-18"),
        date: "2026-04-18",
        label: "Rent",
        amount: 500,
        type: "bill" as const,
      },
    ];
    const preview = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 200,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    });
    const applied = applySkipsToEvents(ordered, [
      {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    ]);
    expect(applied.filter((event) => event.type === "bill")).toHaveLength(0);
    expect(preview.endAvailableMoneyDelta).toBe(500);
  });
});

describe("commitmentSkipDisplayIndex", () => {
  it("marks skipped and spread targets", () => {
    const baseline = baselineEvents();
    const idx = commitmentSkipDisplayIndex(baseline, [
      {
        skipId: "s1",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "SPREAD",
        spreadOverN: 2,
      },
    ]);
    expect(idx.get(billEventId(baseCommitment.id, "2026-04-18"))?.isSkipped).toBe(true);
    expect(idx.get(billEventId(baseCommitment.id, "2026-05-02"))?.isSpreadTarget).toBe(true);
  });

  it("marks STANDALONE as skipped with no spread targets", () => {
    const baseline = baselineEvents();
    const idx = commitmentSkipDisplayIndex(baseline, [
      {
        skipId: "s2",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "STANDALONE",
      },
    ]);
    expect(idx.get(billEventId(baseCommitment.id, "2026-04-18"))?.isSkipped).toBe(true);
    expect(idx.get(billEventId(baseCommitment.id, "2026-05-02"))?.isSpreadTarget).toBeFalsy();
  });
});

describe("applyGoalSkipsToGoal", () => {
  it("softens contribution for EXTEND_DATE skips", () => {
    const goal = { id: "g1", name: "Holiday", contributionPerPay: 100, targetDate: "2026-12-01" };
    const out = applyGoalSkipsToGoal(
      goal,
      [{ kind: "goal", goalId: "g1", originalDateIso: "2026-04-18", strategy: "EXTEND_DATE" }],
      { payFrequency: "fortnightly" },
    );
    expect(out.contributionPerPay).toBeLessThan(100);
    expect(out.projectedCompletionIso).toBeDefined();
  });

  it("bumps contribution for REBALANCE skips", () => {
    const goal = {
      id: "g1",
      name: "Holiday",
      contributionPerPay: 100,
      targetDate: "2026-12-01",
    };
    const out = applyGoalSkipsToGoal(goal, [
      { kind: "goal", goalId: "g1", originalDateIso: "2026-04-18", strategy: "REBALANCE" },
    ]);
    expect(out.contributionPerPay).toBeGreaterThan(100);
  });

  it("no-ops when skip list empty", () => {
    const goal = { id: "g1", name: "Holiday", contributionPerPay: 100 };
    const out = applyGoalSkipsToGoal(goal, []);
    expect(out.contributionPerPay).toBe(100);
  });
});

describe("previewSkipImpact per strategy", () => {
  it("MAKE_UP_NEXT improves end balance when next bill absorbs", () => {
    const ordered = baselineEvents().sort((a, b) => a.date.localeCompare(b.date));
    const preview = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 0,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "MAKE_UP_NEXT",
      },
    });
    expect(preview.endAvailableMoneyDelta).toBe(0);
  });

  it("SPREAD preview reports same sign as widening smaller bumps", () => {
    const ordered = baselineEvents().sort((a, b) => a.date.localeCompare(b.date));
    const preview = previewSkipImpact({
      baselineOrdered: ordered,
      startingAvailableMoney: 0,
      skip: {
        kind: "commitment",
        commitmentId: baseCommitment.id,
        originalDateIso: "2026-04-18",
        strategy: "SPREAD",
        spreadOverN: 2,
      },
    });
    expect(typeof preview.endAvailableMoneyDelta).toBe("number");
  });
});

describe("buildTimelineForTest", () => {
  it("runs end-to-end without skips", () => {
    const timeline = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 5000,
      incomes: [baseIncome],
      primaryIncomeId: baseIncome.id,
      commitments: [baseCommitment],
      goals: [],
      horizonDays: 42,
    });
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((event) => typeof event.projectedAvailableMoney === "number")).toBe(true);
  });

  it("MOVE_ON skip improves end balance vs baseline in fixture", () => {
    const base = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 5000,
      incomes: [baseIncome],
      primaryIncomeId: baseIncome.id,
      commitments: [baseCommitment],
      goals: [],
      horizonDays: 42,
    });
    const withSkip = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 5000,
      incomes: [baseIncome],
      primaryIncomeId: baseIncome.id,
      commitments: [baseCommitment],
      goals: [],
      horizonDays: 42,
      skips: [
        {
          kind: "commitment",
          commitmentId: baseCommitment.id,
          originalDateIso: "2026-04-18",
          strategy: "MOVE_ON",
        },
      ],
    });
    const endBase = base[base.length - 1]!.projectedAvailableMoney;
    const endSkip = withSkip[withSkip.length - 1]!.projectedAvailableMoney;
    expect(endSkip).toBeGreaterThanOrEqual(endBase);
  });

  it("STANDALONE skip improves end balance vs baseline in fixture", () => {
    const base = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 5000,
      incomes: [baseIncome],
      primaryIncomeId: baseIncome.id,
      commitments: [baseCommitment],
      goals: [],
      horizonDays: 42,
    });
    const withSkip = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 5000,
      incomes: [baseIncome],
      primaryIncomeId: baseIncome.id,
      commitments: [baseCommitment],
      goals: [],
      horizonDays: 42,
      skips: [
        {
          kind: "commitment",
          commitmentId: baseCommitment.id,
          originalDateIso: "2026-04-18",
          strategy: "STANDALONE",
        },
      ],
    });
    const endBase = base[base.length - 1]!.projectedAvailableMoney;
    const endSkip = withSkip[withSkip.length - 1]!.projectedAvailableMoney;
    expect(endSkip).toBeGreaterThanOrEqual(endBase);
  });
});
