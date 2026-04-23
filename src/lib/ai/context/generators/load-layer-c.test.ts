/**
 * Tests for {@link loadLayerC} — validates the real JSON assumption files and returns
 * them as a composed object.
 *
 * This test intentionally loads the real files from `assumptions/` (rather than mocking
 * `readFile`) so the shipped JSON is a CI-enforced contract: if someone edits a file in
 * a way that violates the schema, this test fails.
 *
 * @module lib/ai/context/generators/load-layer-c.test
 */

import { describe, expect, it, beforeEach } from "vitest";

import { layerCSchema } from "../schemas/layer-c-schema";

import { loadLayerC, __resetLayerCCacheForTests } from "./load-layer-c";

describe("loadLayerC", () => {
  beforeEach(() => {
    __resetLayerCCacheForTests();
  });

  it("loads all three layer-C files and passes the composed schema", async () => {
    const layerC = await loadLayerC({ force: true });
    const parsed = layerCSchema.safeParse(layerC);
    expect(parsed.success).toBe(true);
  });

  it("caches subsequent calls", async () => {
    const first = await loadLayerC({ force: true });
    const second = await loadLayerC();
    expect(second).toBe(first);
  });

  it("stamps lastComposed as a valid ISO timestamp", async () => {
    const layerC = await loadLayerC({ force: true });
    expect(new Date(layerC.lastComposed).toISOString()).toBe(layerC.lastComposed);
  });

  it("exposes CPI confidence for long-horizon answers", async () => {
    const layerC = await loadLayerC({ force: true });
    expect(["high", "medium", "low", "very-low"]).toContain(layerC.economic.cpi.confidence);
  });

  it("exposes at least one tax bracket", async () => {
    const layerC = await loadLayerC({ force: true });
    expect(layerC.tax.individualIncomeTaxBrackets.length).toBeGreaterThan(0);
  });
});
