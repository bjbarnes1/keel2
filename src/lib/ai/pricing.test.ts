import { describe, expect, it } from "vitest";

import { estimateAnthropicCostCentsAud } from "@/lib/ai/pricing";

describe("estimateAnthropicCostCentsAud", () => {
  it("returns non-negative cents for haiku token counts", () => {
    const c = estimateAnthropicCostCentsAud("claude-haiku-4-5-20251001", 1000, 500);
    expect(c).toBeGreaterThanOrEqual(0);
  });

  it("returns non-negative cents for sonnet token counts", () => {
    const c = estimateAnthropicCostCentsAud("claude-sonnet-4-6", 1000, 500);
    expect(c).toBeGreaterThanOrEqual(0);
  });

  it("falls back to sonnet rates for unknown model", () => {
    const c = estimateAnthropicCostCentsAud("unknown-model", 1_000_000, 1_000_000);
    expect(c).toBeGreaterThan(0);
  });
});
