import { describe, expect, it } from "vitest";

import { formatAskSnapshotForPrompt } from "@/lib/ai/ask-context";

describe("formatAskSnapshotForPrompt", () => {
  it("embeds JSON the model can cite", () => {
    const block = formatAskSnapshotForPrompt({
      balanceAsOf: "2025-01-01",
      bankBalance: 1,
      availableMoney: 2,
      endProjectedAvailableMoney42d: 3,
      upcomingEvents: [],
      incomes: [],
      commitments: [],
      goals: [],
    });
    expect(block).toContain("GROUNDED_SNAPSHOT_JSON");
    expect(block).toContain('"availableMoney":2');
  });
});
