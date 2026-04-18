import { describe, expect, it } from "vitest";

import { buildTimelineForTest } from "@/lib/engine/keel";

/**
 * Option A from the skip plan: exercises `calculateAvailableMoney` + `buildProjectionTimeline`
 * wiring through `buildTimelineForTest` without Prisma.
 */
describe("buildTimelineForTest integration", () => {
  it("keeps income events while applying commitment skips", () => {
    const timeline = buildTimelineForTest({
      asOfIso: "2026-04-10",
      bankBalance: 3000,
      incomes: [
        {
          id: "i1",
          name: "Salary",
          amount: 3000,
          frequency: "monthly",
          nextPayDate: "2026-04-30",
        },
      ],
      primaryIncomeId: "i1",
      commitments: [
        {
          id: "czzzzzzzzzzzzzzzzzzzzzzzzz",
          name: "Loan",
          amount: 400,
          frequency: "monthly",
          nextDueDate: "2026-04-25",
        },
      ],
      goals: [
        {
          id: "g1",
          name: "Buffer",
          contributionPerPay: 50,
          fundedByIncomeId: "i1",
        },
      ],
      skips: [
        {
          kind: "commitment",
          commitmentId: "czzzzzzzzzzzzzzzzzzzzzzzzz",
          originalDateIso: "2026-04-25",
          strategy: "MAKE_UP_NEXT",
        },
        { kind: "goal", goalId: "g1", originalDateIso: "2026-04-30", strategy: "REBALANCE" },
      ],
      horizonDays: 60,
    });

    const hasIncome = timeline.some((event) => event.type === "income");
    expect(hasIncome).toBe(true);
    const last = timeline[timeline.length - 1]!;
    expect(Number.isFinite(last.projectedAvailableMoney)).toBe(true);
  });
});
