"use client";

/**
 * useTimelineEvents
 *
 * Manages a scrolling window of projection events centered on a focal date. Fetches the
 * initial chunk on mount, then pre-fetches an adjacent 28-day chunk whenever the focal
 * date gets within a 5-day edge band. Enforces a hard 24-week (168-day) max horizon in
 * either direction from today. Debounces duplicate chunk requests via a `recentFetches`
 * ledger.
 *
 * The bulk of the logic lives in pure functions below (`timelineEventsReducer`,
 * `planFetch`, `mergeEvents`, `makeRangeKey`) so the React hook itself is a thin effect
 * layer. Tests target the pure pieces directly.
 *
 * @module lib/hooks/use-timeline-events
 *
 * Public contract (consumer-facing):
 *   - `events` — the full loaded window, sorted ascending by date.
 *   - `eventsInViewport` — filtered to [focalDate - 7d, focalDate + 7d].
 *   - `isLoading` — true while the first chunk is in flight.
 *   - `isFetchingMore` — true during an adjacent pre-fetch.
 *   - `hasReachedMaxHorizon` — true when `focalDate` is within 2 weeks of the 24-week
 *     limit, so consumers can show an edge indicator.
 *   - `error` — populated on fetch failure; surface a retry UI, do not auto-retry.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { loadProjectionChunk } from "@/app/actions/keel";
import type { ProjectionEvent } from "@/lib/engine/keel";
import {
  addDaysUtc,
  diffDaysUtc,
  fromIsoDate,
  startOfUtcDay,
  toIsoDate as toIsoDateUtc,
} from "@/lib/timeline/waterline-geometry";

// --- Constants ---------------------------------------------------------------

/** Hard cap on how far from today the user can scroll. 24 weeks ≈ 168 days. */
export const MAX_HORIZON_DAYS = 24 * 7;

/** Days before today where the initial chunk starts (so the focal date is centered). */
export const INITIAL_CENTER_OFFSET_DAYS = 21;

/** Size of the initial chunk loaded on mount. */
export const INITIAL_CHUNK_DAYS = 42;

/** Size of adjacent pre-fetch chunks. */
export const ADJACENT_CHUNK_DAYS = 28;

/** How close `focalDate` must get to the window edge before triggering a pre-fetch. */
export const EDGE_DISTANCE_DAYS = 5;

/** Distance from the 24-week limit at which we flag `hasReachedMaxHorizon`. */
export const MAX_HORIZON_WARN_DAYS = 14;

/** Any fetch for the same range key within this window is skipped. */
export const DEBOUNCE_WINDOW_MS = 2_000;

/** Entries older than this are pruned from `recentFetches`. */
export const PRUNE_THRESHOLD_MS = 10_000;

/** Viewport half-width (days before + after focal). */
export const VIEWPORT_HALF_WIDTH_DAYS = 7;

// --- Types -------------------------------------------------------------------

export type LoadedWindow = {
  startDateIso: string;
  endDateIso: string;
  events: ProjectionEvent[];
};

export type RecentFetch = { rangeKey: string; timestamp: number };

export type TimelineEventsState = {
  window: LoadedWindow | null;
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  recentFetches: RecentFetch[];
  error: Error | null;
};

export type TimelineEventsAction =
  | { type: "INIT_LOAD_START"; rangeKey: string; timestamp: number }
  | { type: "INIT_LOAD_SUCCESS"; window: LoadedWindow }
  | { type: "INIT_LOAD_ERROR"; error: Error }
  | {
      type: "FETCH_MORE_START";
      rangeKey: string;
      timestamp: number;
    }
  | {
      type: "FETCH_MORE_SUCCESS_FORWARD";
      events: ProjectionEvent[];
      newEndIso: string;
    }
  | {
      type: "FETCH_MORE_SUCCESS_BACKWARD";
      events: ProjectionEvent[];
      newStartIso: string;
    }
  | { type: "FETCH_MORE_ERROR"; error: Error }
  | { type: "PRUNE_RECENT_FETCHES"; now: number };

export type UseTimelineEventsReturn = {
  events: ProjectionEvent[];
  eventsInViewport: ProjectionEvent[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasReachedMaxHorizon: boolean;
  error: Error | null;
};

export type FetchPlan =
  | { kind: "none" }
  | {
      kind: "initial" | "forward" | "backward";
      startDateIso: string;
      horizonDays: number;
      rangeKey: string;
    };

// --- Pure helpers ------------------------------------------------------------

export const INITIAL_STATE: TimelineEventsState = {
  window: null,
  isInitialLoading: false,
  isFetchingMore: false,
  recentFetches: [],
  error: null,
};

/** UTC calendar date as `YYYY-MM-DD` (timeline convention). */
export function toIsoDate(date: Date): string {
  return toIsoDateUtc(date);
}

export function addDaysIso(iso: string, days: number): string {
  return toIsoDateUtc(addDaysUtc(fromIsoDate(iso), days));
}

export function daysBetweenIso(startIso: string, endIso: string): number {
  return diffDaysUtc(fromIsoDate(startIso), fromIsoDate(endIso));
}

export function makeRangeKey(startDateIso: string, horizonDays: number): string {
  return `${startDateIso}:${horizonDays}`;
}

export function hasReachedMaxHorizonForFocal(input: { today: Date; focalDate: Date }): boolean {
  const todayIso = toIsoDate(input.today);
  const focalIso = toIsoDate(input.focalDate);
  const delta = Math.abs(daysBetweenIso(todayIso, focalIso));
  return delta > MAX_HORIZON_DAYS - MAX_HORIZON_WARN_DAYS;
}

export function mergeEvents(
  existing: ProjectionEvent[],
  incoming: ProjectionEvent[],
): ProjectionEvent[] {
  const map = new Map<string, ProjectionEvent>();
  for (const event of existing) map.set(event.id, event);
  for (const event of incoming) map.set(event.id, event);
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function isDebounced(
  state: TimelineEventsState,
  rangeKey: string,
  now: number,
): boolean {
  return state.recentFetches.some(
    (entry) => entry.rangeKey === rangeKey && now - entry.timestamp < DEBOUNCE_WINDOW_MS,
  );
}

export function pruneRecentFetches(
  recentFetches: RecentFetch[],
  now: number,
): RecentFetch[] {
  return recentFetches.filter((entry) => now - entry.timestamp < PRUNE_THRESHOLD_MS);
}

/**
 * Decides whether the hook should fire a fetch right now, and with what arguments.
 * Pure — returns a `FetchPlan`. The hook interprets the plan and invokes the server action.
 */
export function planFetch(input: {
  state: TimelineEventsState;
  focalDate: Date;
  today: Date;
  now: number;
}): FetchPlan {
  const { state, focalDate, today, now } = input;
  const todayIso = toIsoDate(today);
  const focalIso = toIsoDate(focalDate);

  // Hard horizon cap — don't try to load chunks past 24 weeks in either direction.
  const focalFromToday = daysBetweenIso(todayIso, focalIso);
  if (Math.abs(focalFromToday) > MAX_HORIZON_DAYS) {
    return { kind: "none" };
  }

  // Initial load path.
  if (!state.window) {
    if (state.isInitialLoading) return { kind: "none" };
    const startDateIso = addDaysIso(todayIso, -INITIAL_CENTER_OFFSET_DAYS);
    const rangeKey = makeRangeKey(startDateIso, INITIAL_CHUNK_DAYS);
    if (isDebounced(state, rangeKey, now)) return { kind: "none" };
    return {
      kind: "initial",
      startDateIso,
      horizonDays: INITIAL_CHUNK_DAYS,
      rangeKey,
    };
  }

  if (state.isFetchingMore) return { kind: "none" };

  // Forward edge — focalDate within EDGE_DISTANCE_DAYS of window.endDate.
  const toEnd = daysBetweenIso(focalIso, state.window.endDateIso);
  if (toEnd >= 0 && toEnd <= EDGE_DISTANCE_DAYS) {
    const startDateIso = addDaysIso(state.window.endDateIso, 1);
    const proposedEndIso = addDaysIso(startDateIso, ADJACENT_CHUNK_DAYS);
    if (daysBetweenIso(todayIso, proposedEndIso) > MAX_HORIZON_DAYS) {
      return { kind: "none" };
    }
    const rangeKey = makeRangeKey(startDateIso, ADJACENT_CHUNK_DAYS);
    if (isDebounced(state, rangeKey, now)) return { kind: "none" };
    return {
      kind: "forward",
      startDateIso,
      horizonDays: ADJACENT_CHUNK_DAYS,
      rangeKey,
    };
  }

  // Backward edge — focalDate within EDGE_DISTANCE_DAYS of window.startDate.
  const fromStart = daysBetweenIso(state.window.startDateIso, focalIso);
  if (fromStart >= 0 && fromStart <= EDGE_DISTANCE_DAYS) {
    const startDateIso = addDaysIso(state.window.startDateIso, -ADJACENT_CHUNK_DAYS);
    if (daysBetweenIso(startDateIso, todayIso) > MAX_HORIZON_DAYS) {
      return { kind: "none" };
    }
    const rangeKey = makeRangeKey(startDateIso, ADJACENT_CHUNK_DAYS);
    if (isDebounced(state, rangeKey, now)) return { kind: "none" };
    return {
      kind: "backward",
      startDateIso,
      horizonDays: ADJACENT_CHUNK_DAYS,
      rangeKey,
    };
  }

  return { kind: "none" };
}

/** Pure state machine. Every action produces a new state; no side effects. */
export function timelineEventsReducer(
  state: TimelineEventsState,
  action: TimelineEventsAction,
): TimelineEventsState {
  switch (action.type) {
    case "INIT_LOAD_START":
      return {
        ...state,
        isInitialLoading: true,
        error: null,
        recentFetches: [
          ...state.recentFetches,
          { rangeKey: action.rangeKey, timestamp: action.timestamp },
        ],
      };
    case "INIT_LOAD_SUCCESS":
      return {
        ...state,
        window: action.window,
        isInitialLoading: false,
      };
    case "INIT_LOAD_ERROR":
      return {
        ...state,
        isInitialLoading: false,
        error: action.error,
      };
    case "FETCH_MORE_START":
      return {
        ...state,
        isFetchingMore: true,
        recentFetches: [
          ...state.recentFetches,
          { rangeKey: action.rangeKey, timestamp: action.timestamp },
        ],
      };
    case "FETCH_MORE_SUCCESS_FORWARD": {
      if (!state.window) return { ...state, isFetchingMore: false };
      return {
        ...state,
        isFetchingMore: false,
        window: {
          startDateIso: state.window.startDateIso,
          endDateIso: action.newEndIso,
          events: mergeEvents(state.window.events, action.events),
        },
      };
    }
    case "FETCH_MORE_SUCCESS_BACKWARD": {
      if (!state.window) return { ...state, isFetchingMore: false };
      return {
        ...state,
        isFetchingMore: false,
        window: {
          startDateIso: action.newStartIso,
          endDateIso: state.window.endDateIso,
          events: mergeEvents(state.window.events, action.events),
        },
      };
    }
    case "FETCH_MORE_ERROR":
      return {
        ...state,
        isFetchingMore: false,
        error: action.error,
      };
    case "PRUNE_RECENT_FETCHES":
      return {
        ...state,
        recentFetches: pruneRecentFetches(state.recentFetches, action.now),
      };
    default: {
      // Exhaustiveness check — the compiler will complain if a new action slips through.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// --- React hook --------------------------------------------------------------

export function useTimelineEvents(focalDate: Date): UseTimelineEventsReturn {
  const [state, dispatch] = useReducer(timelineEventsReducer, INITIAL_STATE);
  const mountedRef = useRef(true);
  const initialLoadStartedRef = useRef(false);

  // Today is stable for the lifetime of the mount. This keeps horizon comparisons coherent
  // even if the user leaves the tab open past midnight.
  const [today] = useState<Date>(() => startOfUtcDay(new Date()));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [today]);

  // Initial load — fires exactly once per mount.
  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;

    const startDateIso = addDaysIso(toIsoDate(today), -INITIAL_CENTER_OFFSET_DAYS);
    const rangeKey = makeRangeKey(startDateIso, INITIAL_CHUNK_DAYS);
    const timestamp = Date.now();

    dispatch({ type: "INIT_LOAD_START", rangeKey, timestamp });

    loadProjectionChunk({ startDateIso, horizonDays: INITIAL_CHUNK_DAYS })
      .then((events) => {
        if (!mountedRef.current) return;
        dispatch({
          type: "INIT_LOAD_SUCCESS",
          window: {
            startDateIso,
            endDateIso: addDaysIso(startDateIso, INITIAL_CHUNK_DAYS),
            events,
          },
        });
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        dispatch({
          type: "INIT_LOAD_ERROR",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
  }, [today]);

  // Adjacent pre-fetch on focalDate movement.
  useEffect(() => {
    if (!state.window) return;
    if (state.isInitialLoading || state.isFetchingMore) return;

    const now = Date.now();
    const plan = planFetch({ state, focalDate, today, now });
    if (plan.kind === "none" || plan.kind === "initial") return;

    dispatch({
      type: "FETCH_MORE_START",
      rangeKey: plan.rangeKey,
      timestamp: now,
    });

    const direction = plan.kind;
    loadProjectionChunk({
      startDateIso: plan.startDateIso,
      horizonDays: plan.horizonDays,
    })
      .then((events) => {
        if (!mountedRef.current) return;
        if (direction === "forward") {
          dispatch({
            type: "FETCH_MORE_SUCCESS_FORWARD",
            events,
            newEndIso: addDaysIso(plan.startDateIso, plan.horizonDays),
          });
        } else {
          dispatch({
            type: "FETCH_MORE_SUCCESS_BACKWARD",
            events,
            newStartIso: plan.startDateIso,
          });
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        dispatch({
          type: "FETCH_MORE_ERROR",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    // `state` intentionally read fresh inside the effect — we depend only on the keys
    // that meaningfully change between planning passes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    focalDate,
    today,
    state.window?.startDateIso,
    state.window?.endDateIso,
    state.isInitialLoading,
    state.isFetchingMore,
  ]);

  // Periodic prune of recentFetches so the ledger doesn't grow unbounded.
  useEffect(() => {
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      dispatch({ type: "PRUNE_RECENT_FETCHES", now: Date.now() });
    }, PRUNE_THRESHOLD_MS);
    return () => clearInterval(id);
  }, []);

  const eventsInViewport = useMemo(() => {
    if (!state.window) return [];
    const focalIso = toIsoDate(focalDate);
    const fromIso = addDaysIso(focalIso, -VIEWPORT_HALF_WIDTH_DAYS);
    const toIso = addDaysIso(focalIso, VIEWPORT_HALF_WIDTH_DAYS);
    return state.window.events.filter(
      (event) => event.date >= fromIso && event.date <= toIso,
    );
  }, [state.window, focalDate]);

  const hasReachedMaxHorizon = useMemo(() => {
    return hasReachedMaxHorizonForFocal({ today, focalDate });
  }, [focalDate, today]);

  return {
    events: state.window?.events ?? [],
    eventsInViewport,
    isLoading: state.isInitialLoading,
    isFetchingMore: state.isFetchingMore,
    hasReachedMaxHorizon,
    error: state.error,
  };
}
