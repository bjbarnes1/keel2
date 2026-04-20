import { describe, expect, it } from "vitest";

import type { ProjectionEvent } from "@/lib/engine/keel";
import {
  ADJACENT_CHUNK_DAYS,
  DEBOUNCE_WINDOW_MS,
  EDGE_DISTANCE_DAYS,
  INITIAL_CENTER_OFFSET_DAYS,
  INITIAL_CHUNK_DAYS,
  INITIAL_STATE,
  MAX_HORIZON_DAYS,
  PRUNE_THRESHOLD_MS,
  addDaysIso,
  daysBetweenIso,
  isDebounced,
  makeRangeKey,
  mergeEvents,
  planFetch,
  pruneRecentFetches,
  timelineEventsReducer,
  toIsoDate,
  type LoadedWindow,
  type TimelineEventsState,
} from "@/lib/hooks/use-timeline-events";

/**
 * The hook is tested through its pure building blocks — `timelineEventsReducer` for state
 * transitions and `planFetch` for scheduling decisions. Both are deterministic and don't
 * require a DOM; React Testing Library is intentionally not a project dependency.
 */

const TODAY = new Date("2026-05-01T00:00:00Z");
const TODAY_ISO = "2026-05-01";

function makeEvent(id: string, date: string, balance: number): ProjectionEvent {
  return {
    id,
    date,
    label: id,
    amount: 100,
    type: "income",
    projectedAvailableMoney: balance,
  };
}

function makeWindowCenteredOnToday(): LoadedWindow {
  const startDateIso = addDaysIso(TODAY_ISO, -INITIAL_CENTER_OFFSET_DAYS);
  const endDateIso = addDaysIso(startDateIso, INITIAL_CHUNK_DAYS);
  return {
    startDateIso,
    endDateIso,
    events: [makeEvent("e1", TODAY_ISO, 1_000)],
  };
}

// --- Date helpers ----------------------------------------------------------

describe("date helpers", () => {
  // `addDaysIso` handles month rollover correctly (critical for end-of-month windows).
  it("adds days across a month boundary", () => {
    expect(addDaysIso("2026-01-30", 3)).toBe("2026-02-02");
  });

  // Negative offsets roll backward across boundaries too.
  it("subtracts days across a year boundary", () => {
    expect(addDaysIso("2026-01-02", -5)).toBe("2025-12-28");
  });

  // `daysBetweenIso` returns signed integer days.
  it("measures days between ISO strings", () => {
    expect(daysBetweenIso("2026-04-01", "2026-04-20")).toBe(19);
    expect(daysBetweenIso("2026-04-20", "2026-04-01")).toBe(-19);
  });

  // `toIsoDate` strips the time component.
  it("converts Date to YYYY-MM-DD", () => {
    expect(toIsoDate(new Date("2026-04-20T23:59:59Z"))).toBe("2026-04-20");
  });
});

// --- Range keys & debounce --------------------------------------------------

describe("range keys and debounce", () => {
  // Range key includes both fields so chunks with same start but different horizons
  // aren't accidentally deduped.
  it("makes a range key from start date + horizon", () => {
    expect(makeRangeKey("2026-05-01", 28)).toBe("2026-05-01:28");
  });

  // A matching recent fetch within 2s suppresses future fetches for that range.
  it("reports debounced when a recent entry exists inside the window", () => {
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      recentFetches: [{ rangeKey: "2026-05-01:28", timestamp: 1_000 }],
    };
    expect(isDebounced(state, "2026-05-01:28", 1_500)).toBe(true);
  });

  // Stale recent entries (older than debounce window) don't suppress new fetches.
  it("does not debounce when the recent entry is older than the window", () => {
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      recentFetches: [{ rangeKey: "2026-05-01:28", timestamp: 1_000 }],
    };
    expect(isDebounced(state, "2026-05-01:28", 1_000 + DEBOUNCE_WINDOW_MS + 1)).toBe(false);
  });

  // Prune removes entries older than PRUNE_THRESHOLD_MS.
  it("prunes stale recent fetches", () => {
    const now = 20_000;
    const pruned = pruneRecentFetches(
      [
        { rangeKey: "fresh", timestamp: now - 1_000 },
        { rangeKey: "stale", timestamp: now - PRUNE_THRESHOLD_MS - 500 },
      ],
      now,
    );
    expect(pruned.map((f) => f.rangeKey)).toEqual(["fresh"]);
  });
});

// --- mergeEvents ------------------------------------------------------------

describe("mergeEvents", () => {
  // Existing + incoming combine into a sorted, deduplicated list.
  it("merges into ascending date order", () => {
    const a = makeEvent("a", "2026-05-10", 1_000);
    const b = makeEvent("b", "2026-05-01", 2_000);
    const c = makeEvent("c", "2026-05-20", 3_000);
    expect(mergeEvents([a], [b, c]).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  // Same id in both sides — the incoming copy wins (newest data).
  it("deduplicates by event id, preferring incoming", () => {
    const existing = makeEvent("shared", "2026-05-10", 999);
    const updated: ProjectionEvent = { ...existing, projectedAvailableMoney: 1_234 };
    const merged = mergeEvents([existing], [updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.projectedAvailableMoney).toBe(1_234);
  });
});

// --- Reducer ---------------------------------------------------------------

describe("timelineEventsReducer", () => {
  // INIT_LOAD_START flips the loading flag, clears any prior error, and records the fetch.
  it("handles INIT_LOAD_START", () => {
    const next = timelineEventsReducer(INITIAL_STATE, {
      type: "INIT_LOAD_START",
      rangeKey: "k1",
      timestamp: 1_000,
    });
    expect(next.isInitialLoading).toBe(true);
    expect(next.error).toBeNull();
    expect(next.recentFetches).toEqual([{ rangeKey: "k1", timestamp: 1_000 }]);
  });

  // INIT_LOAD_SUCCESS stores the window and turns off isInitialLoading.
  it("handles INIT_LOAD_SUCCESS", () => {
    const window = makeWindowCenteredOnToday();
    const next = timelineEventsReducer(
      { ...INITIAL_STATE, isInitialLoading: true },
      { type: "INIT_LOAD_SUCCESS", window },
    );
    expect(next.window).toEqual(window);
    expect(next.isInitialLoading).toBe(false);
  });

  // INIT_LOAD_ERROR captures the error and exits the initial-loading state.
  it("handles INIT_LOAD_ERROR", () => {
    const next = timelineEventsReducer(
      { ...INITIAL_STATE, isInitialLoading: true },
      { type: "INIT_LOAD_ERROR", error: new Error("boom") },
    );
    expect(next.isInitialLoading).toBe(false);
    expect(next.error?.message).toBe("boom");
  });

  // FETCH_MORE_START enables the pre-fetch flag and records the range key.
  it("handles FETCH_MORE_START", () => {
    const next = timelineEventsReducer(INITIAL_STATE, {
      type: "FETCH_MORE_START",
      rangeKey: "kf",
      timestamp: 2_000,
    });
    expect(next.isFetchingMore).toBe(true);
    expect(next.recentFetches).toContainEqual({ rangeKey: "kf", timestamp: 2_000 });
  });

  // Forward success merges new events and extends window.endDateIso.
  it("handles FETCH_MORE_SUCCESS_FORWARD", () => {
    const base: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
      isFetchingMore: true,
    };
    const newEvents = [makeEvent("new-1", addDaysIso(base.window!.endDateIso, 5), 1_500)];
    const newEndIso = addDaysIso(base.window!.endDateIso, ADJACENT_CHUNK_DAYS);
    const next = timelineEventsReducer(base, {
      type: "FETCH_MORE_SUCCESS_FORWARD",
      events: newEvents,
      newEndIso,
    });
    expect(next.isFetchingMore).toBe(false);
    expect(next.window?.endDateIso).toBe(newEndIso);
    expect(next.window?.startDateIso).toBe(base.window!.startDateIso);
    expect(next.window?.events).toHaveLength(2);
  });

  // Backward success merges new events and moves window.startDateIso earlier.
  it("handles FETCH_MORE_SUCCESS_BACKWARD", () => {
    const base: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
      isFetchingMore: true,
    };
    const newStartIso = addDaysIso(base.window!.startDateIso, -ADJACENT_CHUNK_DAYS);
    const next = timelineEventsReducer(base, {
      type: "FETCH_MORE_SUCCESS_BACKWARD",
      events: [makeEvent("earlier", newStartIso, 500)],
      newStartIso,
    });
    expect(next.window?.startDateIso).toBe(newStartIso);
    expect(next.window?.endDateIso).toBe(base.window!.endDateIso);
    expect(next.window?.events[0]?.id).toBe("earlier");
  });

  // Overlapping bills during a fetch (two chunks with shared boundary event) dedupe.
  it("deduplicates events merged from overlapping chunks", () => {
    const base: TimelineEventsState = {
      ...INITIAL_STATE,
      window: {
        startDateIso: TODAY_ISO,
        endDateIso: addDaysIso(TODAY_ISO, INITIAL_CHUNK_DAYS),
        events: [makeEvent("shared", "2026-05-15", 1_000)],
      },
      isFetchingMore: true,
    };
    const next = timelineEventsReducer(base, {
      type: "FETCH_MORE_SUCCESS_FORWARD",
      events: [
        makeEvent("shared", "2026-05-15", 1_000),
        makeEvent("new", "2026-06-10", 1_500),
      ],
      newEndIso: "2026-07-01",
    });
    expect(next.window?.events.map((e) => e.id)).toEqual(["shared", "new"]);
  });

  // FETCH_MORE_ERROR stores error and turns off isFetchingMore.
  it("handles FETCH_MORE_ERROR", () => {
    const base: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
      isFetchingMore: true,
    };
    const next = timelineEventsReducer(base, {
      type: "FETCH_MORE_ERROR",
      error: new Error("network down"),
    });
    expect(next.isFetchingMore).toBe(false);
    expect(next.error?.message).toBe("network down");
  });

  // PRUNE_RECENT_FETCHES removes stale ledger entries.
  it("handles PRUNE_RECENT_FETCHES", () => {
    const now = 100_000;
    const base: TimelineEventsState = {
      ...INITIAL_STATE,
      recentFetches: [
        { rangeKey: "stale", timestamp: now - PRUNE_THRESHOLD_MS - 1 },
        { rangeKey: "fresh", timestamp: now - 500 },
      ],
    };
    const next = timelineEventsReducer(base, { type: "PRUNE_RECENT_FETCHES", now });
    expect(next.recentFetches.map((f) => f.rangeKey)).toEqual(["fresh"]);
  });

  // Forward success without an existing window (shouldn't happen but guard): does nothing
  // destructive — turns off isFetchingMore.
  it("ignores forward success when there is no window", () => {
    const next = timelineEventsReducer(
      { ...INITIAL_STATE, isFetchingMore: true },
      {
        type: "FETCH_MORE_SUCCESS_FORWARD",
        events: [],
        newEndIso: "2026-06-01",
      },
    );
    expect(next.window).toBeNull();
    expect(next.isFetchingMore).toBe(false);
  });
});

// --- planFetch -------------------------------------------------------------

describe("planFetch", () => {
  const now = 10_000;

  // On mount (no window, not loading), plan an initial chunk centered on today.
  it("plans an initial load when no window exists", () => {
    const plan = planFetch({
      state: INITIAL_STATE,
      focalDate: TODAY,
      today: TODAY,
      now,
    });
    expect(plan.kind).toBe("initial");
    if (plan.kind === "initial") {
      expect(plan.startDateIso).toBe(addDaysIso(TODAY_ISO, -INITIAL_CENTER_OFFSET_DAYS));
      expect(plan.horizonDays).toBe(INITIAL_CHUNK_DAYS);
    }
  });

  // Already loading the initial chunk — don't schedule another.
  it("returns none while the initial load is in flight", () => {
    const plan = planFetch({
      state: { ...INITIAL_STATE, isInitialLoading: true },
      focalDate: TODAY,
      today: TODAY,
      now,
    });
    expect(plan.kind).toBe("none");
  });

  // Focal date safely inside the window — no pre-fetch.
  it("returns none when focal date is far from both window edges", () => {
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
    };
    const plan = planFetch({ state, focalDate: TODAY, today: TODAY, now });
    expect(plan.kind).toBe("none");
  });

  // Focal date within EDGE_DISTANCE_DAYS of window.endDate — plan a forward chunk.
  it("plans a forward fetch near the end edge", () => {
    const window = makeWindowCenteredOnToday();
    const state: TimelineEventsState = { ...INITIAL_STATE, window };
    const nearEnd = new Date(
      `${addDaysIso(window.endDateIso, -EDGE_DISTANCE_DAYS + 1)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: nearEnd, today: TODAY, now });
    expect(plan.kind).toBe("forward");
    if (plan.kind === "forward") {
      expect(plan.startDateIso).toBe(addDaysIso(window.endDateIso, 1));
      expect(plan.horizonDays).toBe(ADJACENT_CHUNK_DAYS);
    }
  });

  // Focal date within EDGE_DISTANCE_DAYS of window.startDate — plan a backward chunk.
  it("plans a backward fetch near the start edge", () => {
    const window = makeWindowCenteredOnToday();
    const state: TimelineEventsState = { ...INITIAL_STATE, window };
    const nearStart = new Date(
      `${addDaysIso(window.startDateIso, EDGE_DISTANCE_DAYS - 1)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: nearStart, today: TODAY, now });
    expect(plan.kind).toBe("backward");
    if (plan.kind === "backward") {
      expect(plan.startDateIso).toBe(addDaysIso(window.startDateIso, -ADJACENT_CHUNK_DAYS));
    }
  });

  // Debounce suppresses an edge-fetch when that range was recently requested.
  it("suppresses a forward fetch that was just requested", () => {
    const window = makeWindowCenteredOnToday();
    const nextStartIso = addDaysIso(window.endDateIso, 1);
    const rangeKey = makeRangeKey(nextStartIso, ADJACENT_CHUNK_DAYS);
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      window,
      recentFetches: [{ rangeKey, timestamp: now - 500 }],
    };
    const nearEnd = new Date(
      `${addDaysIso(window.endDateIso, -EDGE_DISTANCE_DAYS + 1)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: nearEnd, today: TODAY, now });
    expect(plan.kind).toBe("none");
  });

  // isFetchingMore guards against concurrent edge-fetches.
  it("returns none while a pre-fetch is in flight", () => {
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
      isFetchingMore: true,
    };
    const nearEnd = new Date(
      `${addDaysIso(state.window!.endDateIso, -EDGE_DISTANCE_DAYS + 1)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: nearEnd, today: TODAY, now });
    expect(plan.kind).toBe("none");
  });

  // Max horizon cap — focal past 24 weeks from today returns none.
  it("returns none when focalDate exceeds MAX_HORIZON_DAYS forward", () => {
    const state: TimelineEventsState = {
      ...INITIAL_STATE,
      window: makeWindowCenteredOnToday(),
    };
    const farFuture = new Date(
      `${addDaysIso(TODAY_ISO, MAX_HORIZON_DAYS + 10)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: farFuture, today: TODAY, now });
    expect(plan.kind).toBe("none");
  });

  // Forward fetch near the limit is suppressed when the proposed chunk would exceed it.
  it("refuses a forward fetch that would push past the 24-week limit", () => {
    const startDateIso = addDaysIso(
      TODAY_ISO,
      MAX_HORIZON_DAYS - INITIAL_CHUNK_DAYS + 2,
    );
    const endDateIso = addDaysIso(startDateIso, INITIAL_CHUNK_DAYS);
    const window: LoadedWindow = { startDateIso, endDateIso, events: [] };
    const state: TimelineEventsState = { ...INITIAL_STATE, window };
    const nearEnd = new Date(
      `${addDaysIso(endDateIso, -EDGE_DISTANCE_DAYS + 1)}T00:00:00Z`,
    );
    const plan = planFetch({ state, focalDate: nearEnd, today: TODAY, now });
    expect(plan.kind).toBe("none");
  });
});
