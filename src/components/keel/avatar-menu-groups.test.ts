import { describe, expect, it } from "vitest";

import { AVATAR_MENU_GROUPS } from "@/components/keel/avatar-menu-groups";

describe("AVATAR_MENU_GROUPS", () => {
  it("has Identity, Data, and Support sections", () => {
    expect(AVATAR_MENU_GROUPS.map((g) => g.id)).toEqual(["identity", "data", "support"]);
  });

  it("does not surface Profile until the screen ships", () => {
    const labels = AVATAR_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    expect(labels.some((l) => /profile/i.test(l))).toBe(false);
  });
});
