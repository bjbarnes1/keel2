/**
 * Pure geometry and derivation helpers for the Waterline chart.
 *
 * Everything in this file is a pure function of its inputs so it can be unit
 * tested without React, SVG, or a browser. The chart component imports from
 * here and stays focused on rendering, gestures, and effects.
 *
 * @module lib/timeline/waterline-geometry
 */

import type { ProjectionEvent } from "@/lib/engine/keel";
import { availableMoneyAt } from "@/lib/engine/keel";

// --- Date helpers (UTC / ISO string based) -----------------------------------

/** Return a new Date offset by `days` at UTC midnight. */
export function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Start-of-UTC-day copy of the input (or today if omitted). */
export function startOfUtcDay(date: Date = new Date()): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function toIsoDate(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Integer days between two UTC midnights (b - a). */
export function diffDaysUtc(a: Date, b: Date): number {
  const ms = startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isSameIsoDay(a: Date | string, b: Date | string): boolean {
  const ai = typeof a === "string" ? a : toIsoDate(a);
  const bi = typeof b === "string" ? b : toIsoDate(b);
  return ai === bi;
}

// --- Depth normalization -----------------------------------------------------

/**
 * Maps an amount to the [0, 1] depth range used by markers. 0 for an empty /
 * zero-amount event, 1 when the event has the largest amount in the viewport.
 * A non-positive max collapses to 0 so callers never divide by zero.
 */
export function normalizeDepth(amount: number, maxInViewport: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxInViewport) || maxInViewport <= 0) {
    return 0;
  }
  const normalized = Math.abs(amount) / maxInViewport;
  if (normalized < 0) return 0;
  if (normalized > 1) return 1;
  return normalized;
}

/** Largest absolute amount across the viewport events, or 0 when empty. */
export function computeMaxAmountInViewport(events: readonly ProjectionEvent[]): number {
  let max = 0;
  for (const event of events) {
    const abs = Math.abs(event.amount);
    if (abs > max) max = abs;
  }
  return max;
}

// --- Viewport filtering ------------------------------------------------------

/**
 * Returns events whose date falls within `[focal - halfWidthDays, focal + halfWidthDays]`
 * (inclusive). Compares on ISO date strings, so callers stay in UTC-day land and
 * never have to worry about local time zones.
 */
export function filterEventsInViewport(
  events: readonly ProjectionEvent[],
  focalDate: Date,
  halfWidthDays: number,
): ProjectionEvent[] {
  const startIso = toIsoDate(addDaysUtc(focalDate, -halfWidthDays));
  const endIso = toIsoDate(addDaysUtc(focalDate, halfWidthDays));
  return events.filter((event) => event.date >= startIso && event.date <= endIso);
}

// --- Same-day stacking -------------------------------------------------------

export type StackedGroup = {
  /** ISO date the group is anchored on. */
  dateIso: string;
  /** Income markers stack above, bill markers stack below. */
  type: "income" | "bill";
  /** The largest-amount event in the group. Renders as the primary marker. */
  primary: ProjectionEvent;
  /** Other same-type, same-day events, rendered as small companion dots. */
  companions: ProjectionEvent[];
};

/**
 * Groups events by `(date, type)`; within each group the event with the largest
 * amount becomes the `primary` and the rest render as companion dots. Income
 * and bill groups on the same date stay separate — one renders above the line,
 * the other below.
 */
export function groupSameDayEvents(events: readonly ProjectionEvent[]): StackedGroup[] {
  const buckets = new Map<string, ProjectionEvent[]>();
  for (const event of events) {
    const key = `${event.date}|${event.type}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(event);
    } else {
      buckets.set(key, [event]);
    }
  }

  const groups: StackedGroup[] = [];
  for (const [key, bucket] of buckets) {
    const separatorIndex = key.indexOf("|");
    const dateIso = key.slice(0, separatorIndex);
    const type = key.slice(separatorIndex + 1) as "income" | "bill";
    const sorted = [...bucket].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.id.localeCompare(b.id),
    );
    const [primary, ...companions] = sorted;
    groups.push({ dateIso, type, primary, companions });
  }

  groups.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return groups;
}

// --- Catmull-Rom path smoothing ---------------------------------------------

export type Point = { x: number; y: number };

/**
 * Returns an SVG `d` path string drawn through every input point using
 * Catmull-Rom interpolation (converted to cubic Beziers so the path renders in
 * SVG without additional tooling). `tension` ∈ (0, 1]; lower = smoother.
 *
 * First and last points are exact (anchors are mirrored to avoid the usual
 * first-and-last Catmull-Rom open-curve artifact).
 */
export function catmullRomPath(points: readonly Point[], tension = 0.5): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  const t = tension;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) * t) / 6;
    const c1y = p1.y + ((p2.y - p0.y) * t) / 6;
    const c2x = p2.x - ((p3.x - p1.x) * t) / 6;
    const c2y = p2.y - ((p3.y - p1.y) * t) / 6;

    d.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

// --- Trajectory points -------------------------------------------------------

export type TrajectoryPoint = { date: Date; iso: string; value: number };

/**
 * Samples available-money along the visible window. For every viewport event
 * we record `projectedAvailableMoney` at that event; plus we bracket the
 * window with the boundary values so the curve always spans edge-to-edge.
 *
 * `allEvents` may extend beyond the viewport — we need the surrounding context
 * so the boundary values reflect any prior events.
 */
export function buildAvailableMoneyTrajectory(input: {
  allEvents: readonly ProjectionEvent[];
  startingAvailableMoney: number;
  viewportStart: Date;
  viewportEnd: Date;
}): TrajectoryPoint[] {
  const { allEvents, startingAvailableMoney, viewportStart, viewportEnd } = input;
  const startIso = toIsoDate(viewportStart);
  const endIso = toIsoDate(viewportEnd);

  const bracketStart: TrajectoryPoint = {
    date: startOfUtcDay(viewportStart),
    iso: startIso,
    value: availableMoneyAt(startIso, allEvents as ProjectionEvent[], startingAvailableMoney),
  };
  const bracketEnd: TrajectoryPoint = {
    date: startOfUtcDay(viewportEnd),
    iso: endIso,
    value: availableMoneyAt(endIso, allEvents as ProjectionEvent[], startingAvailableMoney),
  };

  const points: TrajectoryPoint[] = [bracketStart];
  for (const event of allEvents) {
    if (event.date >= startIso && event.date <= endIso) {
      points.push({
        date: fromIsoDate(event.date),
        iso: event.date,
        value: event.projectedAvailableMoney,
      });
    }
  }
  points.push(bracketEnd);

  points.sort((a, b) => a.iso.localeCompare(b.iso));

  // Keep the latest value for each ISO date (step-function semantics). This
  // also collapses the bracket duplicate when the bracket date coincides with
  // an event.
  const deduped: TrajectoryPoint[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.iso === point.iso) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }

  return deduped;
}

/**
 * Derives a bank-balance trajectory from the available-money projection.
 *
 * Engine projection events are computed from `startingAvailableMoney`, but the cashflow deltas
 * are identical for bank balance and available money. So we can reconstruct a bank balance at
 * any date by applying the same deltas to `startingBankBalance`.
 */
export function buildBankBalanceTrajectory(input: {
  allEvents: readonly ProjectionEvent[];
  startingAvailableMoney: number;
  startingBankBalance: number;
  viewportStart: Date;
  viewportEnd: Date;
}): TrajectoryPoint[] {
  const { allEvents, startingAvailableMoney, startingBankBalance, viewportStart, viewportEnd } =
    input;
  const startIso = toIsoDate(viewportStart);
  const endIso = toIsoDate(viewportEnd);

  const bankBalanceAtIso = (iso: string) => {
    const availAt = availableMoneyAt(iso, allEvents as ProjectionEvent[], startingAvailableMoney);
    return startingBankBalance + (availAt - startingAvailableMoney);
  };

  const bracketStart: TrajectoryPoint = {
    date: startOfUtcDay(viewportStart),
    iso: startIso,
    value: bankBalanceAtIso(startIso),
  };
  const bracketEnd: TrajectoryPoint = {
    date: startOfUtcDay(viewportEnd),
    iso: endIso,
    value: bankBalanceAtIso(endIso),
  };

  const points: TrajectoryPoint[] = [bracketStart];
  for (const event of allEvents) {
    if (event.date >= startIso && event.date <= endIso) {
      points.push({
        date: fromIsoDate(event.date),
        iso: event.date,
        value: startingBankBalance + (event.projectedAvailableMoney - startingAvailableMoney),
      });
    }
  }
  points.push(bracketEnd);

  points.sort((a, b) => a.iso.localeCompare(b.iso));

  const deduped: TrajectoryPoint[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.iso === point.iso) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }
  return deduped;
}

// --- Pay / commitment crossing detection (for haptics) -----------------------

/**
 * Returns events that crossed the Now line between `prev` and `current`.
 * "Crossing" is defined as the event's date being on one side of the focal
 * date on one frame and on the other side on the next — or exactly on focal on
 * one frame and on the opposite side on the next.
 *
 * Events whose date is exactly today on either frame are excluded so scrubbing
 * through today doesn't fire a constant stream of haptics.
 */
export function detectFocalCrossings(input: {
  previousFocalDate: Date;
  currentFocalDate: Date;
  events: readonly ProjectionEvent[];
  todayIso: string;
}): ProjectionEvent[] {
  const prevIso = toIsoDate(input.previousFocalDate);
  const currIso = toIsoDate(input.currentFocalDate);
  if (prevIso === currIso) return [];

  const [loIso, hiIso] = prevIso < currIso ? [prevIso, currIso] : [currIso, prevIso];

  const crossings: ProjectionEvent[] = [];
  for (const event of input.events) {
    if (event.date === input.todayIso) continue;
    if (event.date > loIso && event.date <= hiIso) {
      crossings.push(event);
    }
  }
  return crossings;
}

// --- Horizontal position helpers --------------------------------------------

/**
 * Converts an ISO event date to its x-coordinate in SVG user units for the
 * given viewport. Returns a value in `[padX, width - padX]`; values outside the
 * viewport clamp to the nearest edge so markers never render in the margins.
 */
export function xForIsoDate(input: {
  iso: string;
  viewportStart: Date;
  viewportDays: number;
  width: number;
  padX: number;
}): number {
  const { iso, viewportStart, viewportDays, width, padX } = input;
  const eventDate = fromIsoDate(iso);
  const offsetDays =
    (eventDate.getTime() - startOfUtcDay(viewportStart).getTime()) / 86_400_000;
  const ratio = offsetDays / viewportDays;
  const clamped = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  return padX + clamped * (width - 2 * padX);
}
