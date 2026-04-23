import { describe, expect, it } from "vitest";

import { GLASS_SHEET_MAX_HEIGHT } from "@/components/keel/glass-sheet-layout";

describe("GLASS_SHEET_MAX_HEIGHT", () => {
  it("defines all sheet sizes", () => {
    expect(GLASS_SHEET_MAX_HEIGHT.compact).toContain("40vh");
    expect(GLASS_SHEET_MAX_HEIGHT.medium).toContain("60vh");
    expect(GLASS_SHEET_MAX_HEIGHT.tall).toContain("85vh");
  });
});
