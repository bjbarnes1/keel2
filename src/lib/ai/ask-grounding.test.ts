import { describe, expect, it } from "vitest";

import { enforceAskResponseGrounding } from "@/lib/ai/ask-grounding";
import type { AskContextSnapshot } from "@/lib/ai/ask-context";

const baseSnapshot: AskContextSnapshot = {
  balanceAsOf: "2025-01-01",
  bankBalance: 1000,
  availableMoney: 2500,
  endProjectedAvailableMoney42d: 2600,
  incomes: [{ id: "i1", name: "Salary", amount: 4000, frequency: "fortnightly", nextPayDate: "2025-01-10" }],
  commitments: [
    { id: "c1", name: "Rent", amount: 500, frequency: "weekly", nextDueDate: "2025-01-05", category: "Housing" },
  ],
  goals: [],
};

describe("enforceAskResponseGrounding", () => {
  it("clamps goal_projection todayValue to snapshot availableMoney", () => {
    const out = enforceAskResponseGrounding(
      {
        type: "goal_projection",
        headline: "Goal",
        chart: {
          months: ["Jan"],
          todayValue: 99999,
          targetValue: 100,
          targetLabel: "Target",
        },
      },
      baseSnapshot,
    );
    expect(out.type).toBe("goal_projection");
    if (out.type === "goal_projection") {
      expect(out.chart.todayValue).toBe(2500);
    }
  });

  it("filters spending_summary breakdown to known commitment/goal labels", () => {
    const out = enforceAskResponseGrounding(
      {
        type: "spending_summary",
        headline: "Spend",
        breakdown: [
          { label: "Rent", amount: 500 },
          { label: "Made up vendor", amount: 12 },
        ],
      },
      baseSnapshot,
    );
    expect(out.type).toBe("spending_summary");
    if (out.type === "spending_summary") {
      expect(out.breakdown.map((b) => b.label)).toEqual(["Rent"]);
    }
  });

  it("returns freeform when no breakdown rows survive filtering", () => {
    const out = enforceAskResponseGrounding(
      {
        type: "spending_summary",
        headline: "Spend",
        breakdown: [{ label: "Unknown", amount: 1 }],
      },
      baseSnapshot,
    );
    expect(out.type).toBe("freeform");
  });
});
