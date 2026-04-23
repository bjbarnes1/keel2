import { describe, expect, it } from "vitest";

import { isActivationKey } from "@/components/keel/kebab-row-handlers";

describe("isActivationKey", () => {
  it("accepts Enter and Space when not repeating", () => {
    expect(isActivationKey({ key: "Enter", repeat: false })).toBe(true);
    expect(isActivationKey({ key: " ", repeat: false })).toBe(true);
  });

  it("rejects repeat keydowns", () => {
    expect(isActivationKey({ key: "Enter", repeat: true })).toBe(false);
  });

  it("rejects other keys", () => {
    expect(isActivationKey({ key: "Escape" })).toBe(false);
    expect(isActivationKey({ key: "a" })).toBe(false);
  });
});
