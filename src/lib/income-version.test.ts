import { describe, expect, it } from "vitest";

import { pickIncomeVersionAt } from "./income-version";

describe("pickIncomeVersionAt", () => {
  it("selects the active row for a calendar day", () => {
    const versions = [
      {
        effectiveFrom: new Date("2024-01-01T00:00:00Z"),
        effectiveTo: new Date("2024-06-30T00:00:00Z"),
        name: "Old",
        amount: 1000,
        frequency: "monthly",
        nextPayDate: new Date("2024-06-15T00:00:00Z"),
      },
      {
        effectiveFrom: new Date("2024-07-01T00:00:00Z"),
        effectiveTo: null,
        name: "New",
        amount: 1200,
        frequency: "monthly",
        nextPayDate: new Date("2024-07-10T00:00:00Z"),
      },
    ];

    const june = pickIncomeVersionAt(versions, "2024-06-15");
    expect(june?.name).toBe("Old");

    const july = pickIncomeVersionAt(versions, "2024-07-15");
    expect(july?.name).toBe("New");
  });
});
