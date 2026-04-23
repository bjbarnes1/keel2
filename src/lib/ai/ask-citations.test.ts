import { describe, expect, it } from "vitest";

import type { AskContextSnapshot } from "@/lib/ai/ask-context";
import { buildCitationRefMap, validateFreeformCitations } from "@/lib/ai/ask-citations";

const snapshot: AskContextSnapshot = {
  balanceAsOf: "2025-01-01",
  bankBalance: 1000,
  availableMoney: 2500,
  endProjectedAvailableMoney42d: 2600,
  upcomingEvents: [],
  incomes: [{ id: "i1", name: "Salary", amount: 4000, frequency: "fortnightly", nextPayDate: "2025-01-10" }],
  commitments: [
    { id: "c1", name: "Rent", amount: 500, frequency: "weekly", nextDueDate: "2025-01-05", category: "Housing" },
    { id: "c2", name: "Physio", amount: 100, frequency: "monthly", nextDueDate: "2025-01-15", category: "Health" },
  ],
  goals: [{ id: "g1", name: "Holiday", contributionPerPay: 50, currentBalance: 200, targetAmount: 2000 }],
  categoryTotals: [
    { category: "Housing", annualTotal: 26000, commitmentIds: ["c1"] },
    { category: "Health", annualTotal: 1200, commitmentIds: ["c2"] },
  ],
};

describe("buildCitationRefMap", () => {
  it("includes canonical refs for money and entities", () => {
    const m = buildCitationRefMap(snapshot);
    expect(m.get("available_money")?.amount).toBe(2500);
    expect(m.get("income:i1:amount")?.amount).toBe(4000);
    expect(m.get("commitment:c1:nextDueDate")?.dateIso).toBe("2025-01-05");
    expect(m.get("goal:g1:currentBalance")?.amount).toBe(200);
  });

  it("includes category annual total refs", () => {
    const m = buildCitationRefMap(snapshot);
    expect(m.get("category:Health:annual_total")?.amount).toBe(1200);
    expect(m.get("category:Housing:annual_total")?.amount).toBe(26000);
  });
});

describe("validateFreeformCitations", () => {
  it("accepts empty citations", () => {
    expect(validateFreeformCitations(undefined, snapshot)).toEqual({ ok: true });
  });

  it("accepts matching refs and amounts", () => {
    const r = validateFreeformCitations(
      [{ ref: "available_money", label: "Available", amount: 2500 }],
      snapshot,
    );
    expect(r).toEqual({ ok: true });
  });

  it("rejects unknown refs", () => {
    const r = validateFreeformCitations([{ ref: "nope", label: "x" }], snapshot);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.some((x) => x.startsWith("unknown_ref"))).toBe(true);
  });

  it("rejects amount drift beyond tolerance", () => {
    const r = validateFreeformCitations(
      [{ ref: "available_money", label: "Available", amount: 9999 }],
      snapshot,
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a category annual_total citation", () => {
    const r = validateFreeformCitations(
      [{ ref: "category:Health:annual_total", label: "Health total", amount: 1200 }],
      snapshot,
    );
    expect(r).toEqual({ ok: true });
  });
});
