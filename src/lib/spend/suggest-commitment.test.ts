import { describe, expect, it } from "vitest";

import { suggestCommitments } from "./suggest-commitment";

describe("suggestCommitments", () => {
  const commitments = [
    { id: "1", name: "Netflix" },
    { id: "2", name: "Housing rent" },
    { id: "3", name: "Gym membership" },
  ];

  it("ranks a direct substring match highly", () => {
    const result = suggestCommitments("NETFLIX.COM CHARGE", commitments, 2);
    expect(result[0]?.id).toBe("1");
    expect(result[0]?.score).toBeGreaterThan(50);
  });

  it("uses token overlap when the full name is not contiguous", () => {
    const result = suggestCommitments("RENT PAYMENT SMITH ST", commitments, 3);
    expect(result.map((row) => row.id)).toContain("2");
  });

  it("returns empty when there is no signal", () => {
    const result = suggestCommitments("MYSTERY 12345", commitments);
    expect(result).toEqual([]);
  });
});
