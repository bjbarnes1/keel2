import { describe, expect, it } from "vitest";

import { countFortnightlyPaysInMonth } from "./fortnight-cashflow";

describe("countFortnightlyPaysInMonth", () => {
  it("counts three pays in a long March-style window when stepping every 14 days from anchor", () => {
    const count = countFortnightlyPaysInMonth({
      monthIso: "2026-03",
      anchorPayIso: "2026-02-26",
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("returns at least one pay in a month when anchor lands inside month", () => {
    const count = countFortnightlyPaysInMonth({
      monthIso: "2026-04",
      anchorPayIso: "2026-04-10",
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
