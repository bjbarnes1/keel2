/** Vitest: pure Waterline geometry helpers. */

import { describe, expect, it } from "vitest";

import type { ProjectionEvent } from "@/lib/engine/keel";

import {
  applyDraftOccurrenceOverridesToProjection,
  addDaysUtc,
  buildAvailableMoneyTrajectory,
  buildTimelineTableRows,
  buildWeeklyCashflowBuckets,
  catmullRomPath,
  computeMaxAmountInViewport,
  detectFocalCrossings,
  diffDaysUtc,
  dragPixelsToWholeDayShift,
  dragRemainderPixelsAfterWholeDayShift,
  filterEventsInViewport,
  fromIsoDate,
  groupSameDayEvents,
  isSameIsoDay,
  normalizeDepth,
  toIsoDate,
  xForIsoDate,
} from "./waterline-geometry";

function event(
  partial: Partial<ProjectionEvent> & { id: string; date: string; amount: number; type: ProjectionEvent["type"] },
): ProjectionEvent {
  return {
    label: partial.label ?? partial.id,
    projectedAvailableMoney: partial.projectedAvailableMoney ?? 0,
    ...partial,
  } as ProjectionEvent;
}

describe("date helpers", () => {
  it("addDaysUtc preserves UTC midnight", () => {
    const d = addDaysUtc(new Date("2026-04-20T15:00:00Z"), 3);
    expect(d.toISOString()).toBe("2026-04-23T00:00:00.000Z");
  });

  it("diffDaysUtc counts whole days regardless of wall-clock time", () => {
    const a = new Date("2026-04-20T10:00:00Z");
    const b = new Date("2026-04-25T23:00:00Z");
    expect(diffDaysUtc(a, b)).toBe(5);
  });

  it("isSameIsoDay handles mixed Date / string inputs", () => {
    expect(isSameIsoDay(new Date("2026-04-20T06:00:00Z"), "2026-04-20")).toBe(true);
    expect(isSameIsoDay("2026-04-20", "2026-04-21")).toBe(false);
  });

  it("fromIsoDate and toIsoDate round-trip", () => {
    expect(toIsoDate(fromIsoDate("2026-04-20"))).toBe("2026-04-20");
  });
});

describe("normalizeDepth", () => {
  // Zero-amount events have no visual weight.
  it("returns 0 when amount is 0", () => {
    expect(normalizeDepth(0, 100)).toBe(0);
  });

  // The largest event in the viewport is the reference depth.
  it("returns 1 when amount equals max", () => {
    expect(normalizeDepth(100, 100)).toBe(1);
  });

  // Linear between 0 and 1.
  it("interpolates linearly", () => {
    expect(normalizeDepth(50, 100)).toBeCloseTo(0.5, 5);
  });

  // Negative (outflow) amounts still produce positive depths — the sign is
  // conveyed by which side of the waterline the marker lives on.
  it("treats negative amounts by magnitude", () => {
    expect(normalizeDepth(-75, 100)).toBeCloseTo(0.75, 5);
  });

  // Guard against div-by-zero in the empty / all-zero case.
  it("returns 0 when max is 0 or negative", () => {
    expect(normalizeDepth(50, 0)).toBe(0);
    expect(normalizeDepth(50, -10)).toBe(0);
  });

  it("clamps to 1 when amount exceeds max (stale viewport)", () => {
    expect(normalizeDepth(500, 100)).toBe(1);
  });
});

describe("computeMaxAmountInViewport", () => {
  it("considers both income and commitment amounts", () => {
    const events = [
      event({ id: "a", date: "2026-04-20", type: "income", amount: 200 }),
      event({ id: "b", date: "2026-04-21", type: "bill", amount: 450 }),
      event({ id: "c", date: "2026-04-22", type: "income", amount: 100 }),
    ];
    expect(computeMaxAmountInViewport(events)).toBe(450);
  });

  it("returns 0 for an empty viewport", () => {
    expect(computeMaxAmountInViewport([])).toBe(0);
  });
});

describe("filterEventsInViewport", () => {
  const events = [
    event({ id: "far-past", date: "2026-04-01", type: "income", amount: 10 }),
    event({ id: "near-past", date: "2026-04-19", type: "income", amount: 10 }),
    event({ id: "today", date: "2026-04-21", type: "income", amount: 10 }),
    event({ id: "near-future", date: "2026-04-27", type: "bill", amount: 10 }),
    event({ id: "far-future", date: "2026-05-05", type: "bill", amount: 10 }),
  ];

  // 14-day viewport: focal ± 7 days.
  it("excludes events outside focal ± halfWidth", () => {
    const focal = new Date("2026-04-21T00:00:00Z");
    const filtered = filterEventsInViewport(events, focal, 7);
    expect(filtered.map((e) => e.id)).toEqual(["near-past", "today", "near-future"]);
  });

  it("is inclusive on both edges", () => {
    const focal = new Date("2026-04-21T00:00:00Z");
    const filtered = filterEventsInViewport(events, focal, 14);
    expect(filtered.map((e) => e.id)).toContain("far-future");
  });
});

describe("groupSameDayEvents", () => {
  // Three commitments on the same day stack into one group, largest first.
  it("groups three same-date commitments with primary = largest", () => {
    const events = [
      event({ id: "a", date: "2026-05-05", type: "bill", amount: 120 }),
      event({ id: "b", date: "2026-05-05", type: "bill", amount: 380 }),
      event({ id: "c", date: "2026-05-05", type: "bill", amount: 250 }),
    ];
    const groups = groupSameDayEvents(events);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("b");
    expect(groups[0].companions.map((e) => e.id)).toEqual(["c", "a"]);
  });

  // Mixed income + commitment on the same day should render as two separate
  // groups — one above, one below the waterline.
  it("keeps income and commitment groups separate on the same date", () => {
    const events = [
      event({ id: "pay", date: "2026-05-05", type: "income", amount: 3000 }),
      event({ id: "rent", date: "2026-05-05", type: "bill", amount: 2500 }),
      event({ id: "side", date: "2026-05-05", type: "income", amount: 500 }),
    ];
    const groups = groupSameDayEvents(events);
    expect(groups).toHaveLength(2);
    const incomeGroup = groups.find((g) => g.type === "income");
    const billGroup = groups.find((g) => g.type === "bill");
    expect(incomeGroup?.primary.id).toBe("pay");
    expect(incomeGroup?.companions.map((e) => e.id)).toEqual(["side"]);
    expect(billGroup?.primary.id).toBe("rent");
    expect(billGroup?.companions).toHaveLength(0);
  });

  it("sorts groups ascending by date", () => {
    const events = [
      event({ id: "later", date: "2026-05-10", type: "bill", amount: 100 }),
      event({ id: "earlier", date: "2026-05-01", type: "bill", amount: 100 }),
    ];
    const groups = groupSameDayEvents(events);
    expect(groups.map((g) => g.dateIso)).toEqual(["2026-05-01", "2026-05-10"]);
  });
});

describe("catmullRomPath", () => {
  it("returns an empty string for zero points", () => {
    expect(catmullRomPath([])).toBe("");
  });

  it("returns a plain Move for one point", () => {
    expect(catmullRomPath([{ x: 1, y: 2 }])).toBe("M 1 2");
  });

  it("returns a straight line for two points", () => {
    expect(catmullRomPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe("M 0 0 L 10 10");
  });

  it("passes through the first and last points exactly", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 10 },
      { x: 30, y: 30 },
      { x: 40, y: 15 },
    ];
    const d = catmullRomPath(points);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith(" 40 15")).toBe(true);
  });

  it("produces a path that uses Bezier segments", () => {
    const d = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/C /);
  });

  it("does not emit NaN/Infinity coordinates (path is SVG-safe)", () => {
    const d = catmullRomPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 15 },
        { x: 20, y: 5 },
        { x: 30, y: 10 },
      ],
      0.5,
    );
    expect(d).not.toMatch(/NaN/);
    expect(d).not.toMatch(/Infinity/);
  });
});

describe("buildAvailableMoneyTrajectory", () => {
  const events: ProjectionEvent[] = [
    event({ id: "e1", date: "2026-04-18", type: "income", amount: 1000, projectedAvailableMoney: 1100 }),
    event({ id: "e2", date: "2026-04-22", type: "bill", amount: 300, projectedAvailableMoney: 800 }),
    event({ id: "e3", date: "2026-05-05", type: "income", amount: 1000, projectedAvailableMoney: 1800 }),
  ];

  it("brackets the viewport and includes in-window events", () => {
    const points = buildAvailableMoneyTrajectory({
      allEvents: events,
      startingAvailableMoney: 100,
      viewportStart: new Date("2026-04-20T00:00:00Z"),
      viewportEnd: new Date("2026-04-27T00:00:00Z"),
    });
    const iso = points.map((p) => p.iso);
    expect(iso[0]).toBe("2026-04-20");
    expect(iso[iso.length - 1]).toBe("2026-04-27");
    // The in-window event is present.
    expect(iso).toContain("2026-04-22");
  });

  it("uses the prior event's balance for the start bracket", () => {
    const points = buildAvailableMoneyTrajectory({
      allEvents: events,
      startingAvailableMoney: 100,
      viewportStart: new Date("2026-04-20T00:00:00Z"),
      viewportEnd: new Date("2026-04-27T00:00:00Z"),
    });
    expect(points[0].value).toBe(1100);
  });

  it("falls back to the starting value when no prior events exist", () => {
    const points = buildAvailableMoneyTrajectory({
      allEvents: [],
      startingAvailableMoney: 500,
      viewportStart: new Date("2026-04-20T00:00:00Z"),
      viewportEnd: new Date("2026-04-27T00:00:00Z"),
    });
    expect(points).toHaveLength(2);
    expect(points[0].value).toBe(500);
    expect(points[1].value).toBe(500);
  });
});

describe("detectFocalCrossings", () => {
  const events: ProjectionEvent[] = [
    event({ id: "today", date: "2026-04-21", type: "bill", amount: 50 }),
    event({ id: "soon", date: "2026-04-23", type: "income", amount: 100 }),
    event({ id: "later", date: "2026-04-27", type: "bill", amount: 200 }),
  ];

  it("detects events between the previous and current focal date", () => {
    const crossed = detectFocalCrossings({
      previousFocalDate: new Date("2026-04-22T00:00:00Z"),
      currentFocalDate: new Date("2026-04-24T00:00:00Z"),
      events,
      todayIso: "2026-04-21",
    });
    expect(crossed.map((e) => e.id)).toEqual(["soon"]);
  });

  it("detects backward crossings", () => {
    const crossed = detectFocalCrossings({
      previousFocalDate: new Date("2026-04-28T00:00:00Z"),
      currentFocalDate: new Date("2026-04-22T00:00:00Z"),
      events,
      todayIso: "2026-04-21",
    });
    expect(crossed.map((e) => e.id).sort()).toEqual(["later", "soon"]);
  });

  it("excludes today's event to avoid buzz-storms", () => {
    const crossed = detectFocalCrossings({
      previousFocalDate: new Date("2026-04-19T00:00:00Z"),
      currentFocalDate: new Date("2026-04-23T00:00:00Z"),
      events,
      todayIso: "2026-04-21",
    });
    expect(crossed.map((e) => e.id)).toEqual(["soon"]);
  });

  it("returns nothing when focal hasn't moved a whole day", () => {
    const crossed = detectFocalCrossings({
      previousFocalDate: new Date("2026-04-23T00:00:00Z"),
      currentFocalDate: new Date("2026-04-23T00:00:00Z"),
      events,
      todayIso: "2026-04-21",
    });
    expect(crossed).toEqual([]);
  });
});

describe("xForIsoDate", () => {
  const viewportStart = new Date("2026-04-14T00:00:00Z");

  // Day 0 pins to the left margin.
  it("places viewportStart at the left padding", () => {
    const x = xForIsoDate({
      iso: "2026-04-14",
      viewportStart,
      viewportDays: 14,
      width: 360,
      padX: 10,
    });
    expect(x).toBeCloseTo(10, 5);
  });

  // Day 14 pins to the right margin.
  it("places viewportEnd at the right padding", () => {
    const x = xForIsoDate({
      iso: "2026-04-28",
      viewportStart,
      viewportDays: 14,
      width: 360,
      padX: 10,
    });
    expect(x).toBeCloseTo(350, 5);
  });

  // Mid-window lands at the Now line.
  it("places the midpoint at the center", () => {
    const x = xForIsoDate({
      iso: "2026-04-21",
      viewportStart,
      viewportDays: 14,
      width: 360,
      padX: 10,
    });
    expect(x).toBeCloseTo(180, 5);
  });

  it("clamps dates outside the viewport", () => {
    const before = xForIsoDate({
      iso: "2026-03-01",
      viewportStart,
      viewportDays: 14,
      width: 360,
      padX: 10,
    });
    const after = xForIsoDate({
      iso: "2026-06-01",
      viewportStart,
      viewportDays: 14,
      width: 360,
      padX: 10,
    });
    expect(before).toBeCloseTo(10, 5);
    expect(after).toBeCloseTo(350, 5);
  });
});

describe("chart drag ↔ whole-day shift", () => {
  const ppd = 20;

  it("maps positive drag (finger right) to negative whole-day shifts", () => {
    expect(dragPixelsToWholeDayShift(10, ppd)).toBe(0);
    expect(dragPixelsToWholeDayShift(25, ppd)).toBe(-1);
    expect(dragPixelsToWholeDayShift(39, ppd)).toBe(-1);
    expect(dragPixelsToWholeDayShift(40, ppd)).toBe(-2);
  });

  it("maps negative drag (finger left) to positive whole-day shifts", () => {
    expect(dragPixelsToWholeDayShift(-25, ppd)).toBe(1);
    expect(dragPixelsToWholeDayShift(-40, ppd)).toBe(2);
  });

  it("returns 0 shift for invalid pixels-per-day", () => {
    expect(dragPixelsToWholeDayShift(100, 0)).toBe(0);
    expect(dragRemainderPixelsAfterWholeDayShift(100, 0)).toBe(100);
  });

  it("keeps sub-day remainder pixels stable", () => {
    const dragPx = 35; // -1 whole day at ppd=20 with 15px remainder
    expect(dragPixelsToWholeDayShift(dragPx, ppd)).toBe(-1);
    expect(dragRemainderPixelsAfterWholeDayShift(dragPx, ppd)).toBeCloseTo(15, 5);
  });
});

describe("weekly buckets and table extraction", () => {
  const events: ProjectionEvent[] = [
    event({
      id: "income-i1-2026-04-21",
      type: "income",
      date: "2026-04-21",
      amount: 1000,
      projectedAvailableMoney: 1500,
      sourceKind: "income",
      sourceId: "i1",
      originalDateIso: "2026-04-21",
    }),
    event({
      id: "c-rent-2026-04-24",
      type: "bill",
      date: "2026-04-24",
      amount: 700,
      projectedAvailableMoney: 800,
      sourceKind: "commitment",
      sourceId: "c-rent",
      originalDateIso: "2026-04-24",
    }),
    event({
      id: "income-i1-2026-04-28",
      type: "income",
      date: "2026-04-28",
      amount: 1000,
      projectedAvailableMoney: 1800,
      sourceKind: "income",
      sourceId: "i1",
      originalDateIso: "2026-04-28",
    }),
  ];

  it("aggregates income/commitments and closing balances by week", () => {
    const buckets = buildWeeklyCashflowBuckets({
      events,
      startingAvailableMoney: 500,
      startingBankBalance: 2000,
      windowStart: new Date("2026-04-20T00:00:00Z"),
      windowEnd: new Date("2026-05-03T00:00:00Z"),
    });

    expect(buckets.length).toBe(2);
    expect(buckets[0]?.income).toBe(1000);
    expect(buckets[0]?.commitments).toBe(700);
    expect(buckets[0]?.closingAvailableMoney).toBe(800);
    expect(buckets[0]?.closingBankBalance).toBe(2300);
    expect(buckets[1]?.income).toBe(1000);
    expect(buckets[1]?.closingAvailableMoney).toBe(1800);
  });

  it("extracts 30-day table rows with bank-balance projection", () => {
    const rows = buildTimelineTableRows({
      events,
      startingAvailableMoney: 500,
      startingBankBalance: 2000,
      windowStartIso: "2026-04-20",
      days: 30,
    });

    expect(rows).toHaveLength(3);
    expect(rows[1]?.projectedBankBalance).toBe(2300);
    expect(rows[1]?.sourceKind).toBe("commitment");
    expect(rows[1]?.originalDateIso).toBe("2026-04-24");
  });

  it("applies draft date overrides and recomputes running balances", () => {
    const shifted = applyDraftOccurrenceOverridesToProjection({
      events,
      startingAvailableMoney: 500,
      overrides: [
        {
          kind: "commitment",
          sourceId: "c-rent",
          originalDateIso: "2026-04-24",
          scheduledDateIso: "2026-04-29",
        },
      ],
    });

    const moved = shifted.find((row) => row.id === "c-rent-2026-04-24");
    expect(moved?.date).toBe("2026-04-29");

    const apr28Income = shifted.find((row) => row.id === "income-i1-2026-04-28");
    const apr29Rent = shifted.find((row) => row.id === "c-rent-2026-04-24");
    expect(apr28Income?.projectedAvailableMoney).toBe(2500);
    expect(apr29Rent?.projectedAvailableMoney).toBe(1800);
  });
});
