import { describe, expect, it } from "vitest";

import { askResponseSchema } from "@/lib/ai/ask-keel-schema";
import {
  capturePrefillPayloadSchema,
  decodeCapturePrefillParam,
  encodeCapturePrefillPayload,
} from "@/lib/ai/capture-prefill";

const commitmentFixture = {
  name: "Gym",
  amount: 80,
  frequency: "monthly" as const,
  nextDueDate: "2026-05-01",
  category: "Other",
  perPay: 40,
  perPayAuto: true,
};

describe("capture-prefill", () => {
  it("round-trips encode → decode (decoded query style)", () => {
    const payload = {
      sentence: "Gym is $80 monthly",
      capture: { kind: "commitment" as const, payload: commitmentFixture },
    };
    const encoded = encodeCapturePrefillPayload(payload);
    const decoded = decodeCapturePrefillParam(encoded);
    expect(decoded).toEqual(payload);
  });

  it("decodes percent-encoded JSON (simulates raw href)", () => {
    const payload = capturePrefillPayloadSchema.parse({
      sentence: "Salary",
      capture: {
        kind: "income",
        payload: {
          name: "Salary",
          amount: 5000,
          frequency: "monthly",
          nextPayDate: null,
        },
      },
    });
    const hrefValue = encodeURIComponent(JSON.stringify(payload));
    expect(decodeCapturePrefillParam(hrefValue)).toEqual(payload);
  });

  it("returns null for invalid JSON", () => {
    expect(decodeCapturePrefillParam("not-json")).toBeNull();
  });

  it("returns null when capture payload fails Zod", () => {
    const bad = encodeURIComponent(JSON.stringify({ sentence: "x", capture: { kind: "commitment", payload: {} } }));
    expect(decodeCapturePrefillParam(bad)).toBeNull();
  });
});

describe("askResponseSchema capture_redirect", () => {
  it("parses a valid capture_redirect response", () => {
    const data = askResponseSchema.parse({
      type: "capture_redirect",
      headline: "Opening capture for Gym…",
      sentence: "Gym is $80 monthly",
      capture: { kind: "commitment", payload: commitmentFixture },
    });
    expect(data.type).toBe("capture_redirect");
    if (data.type === "capture_redirect") {
      expect(data.capture.kind).toBe("commitment");
      expect(data.capture.payload.name).toBe("Gym");
    }
  });
});
