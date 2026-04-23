import { describe, expect, it } from "vitest";

import { estimateAnthropicCostCentsAud } from "@/lib/ai/pricing";

describe("estimateAnthropicCostCentsAud", () => {
  it("returns non-negative cents for token counts", () => {
    const c = estimateAnthropicCostCentsAud("claude-3-5-haiku-20241022", 1000, 500);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});
