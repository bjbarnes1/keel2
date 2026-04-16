import { describe, expect, it } from "vitest";

import { normalizeParsedBill } from "@/lib/ai/parse-bill";

describe("normalizeParsedBill", () => {
  it("accepts capitalized frequency and string numbers", () => {
    const parsed = normalizeParsedBill({
      name: "Car Insurance",
      amount: "$480",
      frequency: "Quarterly",
      nextDueDate: "2026-06-15",
      category: "Insurance",
      perPay: "80",
    });

    expect(parsed).toEqual({
      name: "Car Insurance",
      amount: 480,
      frequency: "quarterly",
      nextDueDate: "2026-06-15",
      category: "Insurance",
      perPay: 80,
    });
  });

  it("normalizes natural-language dates from model output", () => {
    const parsed = normalizeParsedBill({
      name: "Netflix",
      amount: 22.99,
      frequency: "monthly",
      nextDueDate: "Apr 19, 2026",
      category: "Subscriptions",
      perPay: 11.5,
    });

    expect(parsed.nextDueDate).toBe("2026-04-19");
  });

  it("falls back unknown categories to Other", () => {
    const parsed = normalizeParsedBill({
      name: "Gym",
      amount: 45,
      frequency: "Monthly",
      nextDueDate: null,
      category: "Fitness",
      perPay: 22.5,
    });

    expect(parsed.category).toBe("Other");
  });
});
