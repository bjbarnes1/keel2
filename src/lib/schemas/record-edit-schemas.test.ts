import { describe, expect, it } from "vitest";

import {
  commitmentEditSchema,
  incomeEditSchema,
} from "@/lib/schemas/record-edit-schemas";

describe("incomeEditSchema", () => {
  it("accepts valid payload", () => {
    const r = incomeEditSchema.safeParse({
      name: "Pay",
      amount: 5000,
      frequency: "fortnightly",
      nextPayDate: "2026-04-30",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = incomeEditSchema.safeParse({
      name: "",
      amount: 1,
      frequency: "monthly",
      nextPayDate: "2026-04-30",
    });
    expect(r.success).toBe(false);
  });
});

describe("commitmentEditSchema", () => {
  it("coerces blank optional subcategory to undefined", () => {
    const r = commitmentEditSchema.safeParse({
      name: "Rent",
      amount: 400,
      frequency: "monthly",
      nextDueDate: "2026-05-01",
      categoryId: "cat1",
      subcategoryId: "",
      fundedByIncomeId: "inc1",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subcategoryId).toBeUndefined();
      expect(r.data.fundedByIncomeId).toBe("inc1");
    }
  });
});
