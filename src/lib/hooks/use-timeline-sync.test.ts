import { describe, expect, it } from "vitest";

import { applyFocalUpdate, type SyncState } from "@/lib/hooks/use-timeline-sync";

/**
 * The hook's React/timer orchestration is covered by the visual timeline PR (where it
 * ships as the integration surface). Here we nail down the pure state-transition
 * contract: given a source and a date, what shape does the next state take?
 */

const INITIAL: SyncState = {
  focalDate: new Date("2026-05-01T00:00:00Z"),
  source: null,
};

describe("applyFocalUpdate", () => {
  // Chart-origin update — state reflects the new date AND tags itself "chart".
  // Consumers that detect source === "chart" skip their own reaction (prevents feedback).
  it("tags a chart-driven update with source 'chart'", () => {
    const next = applyFocalUpdate(INITIAL, "chart", new Date("2026-05-10T00:00:00Z"));
    expect(next.focalDate.toISOString().slice(0, 10)).toBe("2026-05-10");
    expect(next.source).toBe("chart");
  });

  // Legend-origin update — state tag flips to "legend" so the chart's listener knows
  // it should animate to match.
  it("tags a legend-driven update with source 'legend'", () => {
    const next = applyFocalUpdate(INITIAL, "legend", new Date("2026-05-20T00:00:00Z"));
    expect(next.focalDate.toISOString().slice(0, 10)).toBe("2026-05-20");
    expect(next.source).toBe("legend");
  });

  // A later update always clobbers the previous one (no merging) — prevents a stale
  // source-tag from bleeding across two distinct gestures.
  it("replaces focalDate and source on every call", () => {
    const afterChart = applyFocalUpdate(INITIAL, "chart", new Date("2026-05-10T00:00:00Z"));
    const afterLegend = applyFocalUpdate(afterChart, "legend", new Date("2026-05-15T00:00:00Z"));
    expect(afterLegend.focalDate.toISOString().slice(0, 10)).toBe("2026-05-15");
    expect(afterLegend.source).toBe("legend");
  });

  // The previous state is not mutated in place — SyncState is value-like.
  it("returns a new object without mutating the previous state", () => {
    const next = applyFocalUpdate(INITIAL, "chart", new Date("2026-05-10T00:00:00Z"));
    expect(next).not.toBe(INITIAL);
    expect(INITIAL.source).toBeNull();
    expect(INITIAL.focalDate.toISOString().slice(0, 10)).toBe("2026-05-01");
  });
});
