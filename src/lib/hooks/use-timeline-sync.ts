"use client";

/**
 * useTimelineSync
 *
 * Shared `focalDate` state for the Timeline chart and the event legend so either side
 * can drive the other without a feedback loop. The hook tags each update with its
 * `source` ("chart" | "legend" | null) so consumers can decide whether to react.
 *
 * Consumer pattern (do not skip this — the feedback-loop prevention lives here):
 *
 *   const { focalDate, source, setFocalDateFromChart, setFocalDateFromLegend } =
 *     useTimelineSync();
 *
 *   // ChartComponent
 *   useEffect(() => {
 *     if (source === "chart") return;              // origin: don't react to self
 *     chart.scrollTo(focalDate);                   // react to legend or external change
 *   }, [focalDate, source]);
 *
 *   // LegendComponent
 *   useEffect(() => {
 *     if (source === "legend") return;             // origin: don't react to self
 *     legend.scrollTo(focalDate);                  // react to chart or external change
 *   }, [focalDate, source]);
 *
 * The hook itself doesn't know which consumer is driving; it just records the claim and
 * briefly holds it so the opposite-side listener can skip the round-trip.
 *
 * Timing:
 *   - Chart updates: state mutates *immediately* (swipes need to feel instant) and the
 *     source claim is held for SOURCE_LOCKOUT_MS before resetting to null.
 *   - Legend updates: debounced by LEGEND_DEBOUNCE_MS (scroll listeners fire often).
 *     After debounce resolves, the state mutates and SOURCE_LOCKOUT_MS lockout kicks in.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** How long after an update the origin tag stays attached (ms). */
export const SOURCE_LOCKOUT_MS = 300;

/** Debounce window for legend-driven updates (scroll listeners fire often). */
export const LEGEND_DEBOUNCE_MS = 200;

export type SyncSource = "chart" | "legend" | null;

export type SyncState = {
  focalDate: Date;
  source: SyncSource;
};

export type UseTimelineSyncReturn = SyncState & {
  setFocalDateFromChart: (date: Date) => void;
  setFocalDateFromLegend: (date: Date) => void;
};

/**
 * Pure — produces the next SyncState for a given update. Exported for unit tests of the
 * state-transition contract. Timing (debounce / lockout) is orchestrated by the hook.
 */
export function applyFocalUpdate(
  _previous: SyncState,
  source: Exclude<SyncSource, null>,
  date: Date,
): SyncState {
  return { focalDate: date, source };
}

export function useTimelineSync(initialDate?: Date): UseTimelineSyncReturn {
  const [state, setState] = useState<SyncState>(() => ({
    focalDate: initialDate ?? new Date(),
    source: null,
  }));

  const sourceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legendDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sourceTimeoutRef.current) clearTimeout(sourceTimeoutRef.current);
      if (legendDebounceRef.current) clearTimeout(legendDebounceRef.current);
    };
  }, []);

  const scheduleSourceReset = useCallback(() => {
    if (sourceTimeoutRef.current) clearTimeout(sourceTimeoutRef.current);
    sourceTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, source: null }));
    }, SOURCE_LOCKOUT_MS);
  }, []);

  const setFocalDateFromChart = useCallback(
    (date: Date) => {
      setState((prev) => applyFocalUpdate(prev, "chart", date));
      scheduleSourceReset();
    },
    [scheduleSourceReset],
  );

  const setFocalDateFromLegend = useCallback(
    (date: Date) => {
      if (legendDebounceRef.current) clearTimeout(legendDebounceRef.current);
      legendDebounceRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setState((prev) => applyFocalUpdate(prev, "legend", date));
        scheduleSourceReset();
      }, LEGEND_DEBOUNCE_MS);
    },
    [scheduleSourceReset],
  );

  return {
    focalDate: state.focalDate,
    source: state.source,
    setFocalDateFromChart,
    setFocalDateFromLegend,
  };
}
