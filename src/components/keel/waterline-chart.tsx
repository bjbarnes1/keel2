"use client";

/**
 * WaterlineChart — the Timeline's flagship visual surface.
 *
 * Design discipline (do not drift without discussing first):
 *   - 14-day viewport. Data moves past the Now line, not the other way around.
 *   - Proportional depths above and below the baseline; same-day markers stack
 *     as "primary + companion dot" rather than fighting for x-space.
 *   - Sea-green trajectory curve below the line, with a focal dot sliding along
 *     it connecting the two metaphors (waterline + trajectory).
 *   - Gesture model: horizontal drag updates focal immediately via rAF;
 *     pointer-up decays with exponential momentum (~400ms).
 *   - Motion tokens:
 *       * focal dot slide: 280ms, cubic-bezier(0.34, 1.56, 0.64, 1) (slight overshoot).
 *       * pulse ring: 2s ease-in-out loop, pauses during active gesture.
 *       * Reduced-motion: instant transitions, no pulse, no momentum.
 *
 * @module components/keel/waterline-chart
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { ProjectionEvent } from "@/lib/engine/keel";
import {
  addDaysUtc,
  buildAvailableMoneyTrajectory,
  catmullRomPath,
  computeMaxAmountInViewport,
  detectFocalCrossings,
  filterEventsInViewport,
  groupSameDayEvents,
  normalizeDepth,
  startOfUtcDay,
  toIsoDate,
  xForIsoDate,
} from "@/lib/timeline/waterline-geometry";
import { hapticCommitmentCrossing, hapticPayCrossing } from "@/lib/haptics";
import { cn } from "@/lib/utils";

// --- Layout constants (SVG user units) ---------------------------------------

const VIEWPORT_DAYS = 14;
const SVG_HEIGHT = 220;
const PAD_X = 10;
const BASELINE_Y = 113;
const ABOVE_TOP = 32;
const ABOVE_BOTTOM = 108;
const BELOW_TOP = 118;
const BELOW_BOTTOM = 195;
const LABEL_Y = 207;

const TRAJECTORY_RANGE = BELOW_BOTTOM - BELOW_TOP;

// Marker sizing tuning (per spec).
const MARKER_MIN_HEIGHT = 8;
const MARKER_DEPTH_RANGE = 65;
const MARKER_MIN_RADIUS = 3;
const MARKER_RADIUS_RANGE = 2.5;
const COMPANION_OFFSET = 4;
const COMPANION_RADIUS_SCALE = 0.6;

// --- Types -------------------------------------------------------------------

export type WaterlineChartProps = {
  /** Events that currently intersect the 14-day viewport. */
  eventsInViewport: ProjectionEvent[];
  /** All loaded events (used for the trajectory curve, which needs context). */
  allEvents: ProjectionEvent[];
  focalDate: Date;
  todayDate: Date;
  /** Called during pointer drag and momentum. Always fires with UTC-midnight dates. */
  onFocalChange: (date: Date) => void;
  availableMoneyAtFocal: number;
  startingAvailableMoney: number;
  /** Set of commitment ids currently in attention state (amber anchor). */
  attentionCommitmentIds?: ReadonlySet<string>;
  /** Container width in CSS pixels (SVG scales to 100% and we match viewBox). */
  width?: number;
  className?: string;
};

// --- Helpers -----------------------------------------------------------------

function commitmentIdFromEventId(eventId: string): string {
  // Engine bill ids look like `<commitmentId>-YYYY-MM-DD`. Strip the ISO date.
  return eventId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

/** Piecewise opacity based on distance from focal. */
function opacityForDate(eventIso: string, focalIsoDay: string, todayIso: string): number {
  const focal = new Date(`${focalIsoDay}T00:00:00Z`).getTime();
  const event = new Date(`${eventIso}T00:00:00Z`).getTime();
  const days = Math.abs(event - focal) / 86_400_000;
  let opacity = 1;
  if (days > 28) opacity = 0.35;
  else if (days > 14) opacity = 0.65;
  if (eventIso < todayIso) opacity = Math.min(opacity, 0.65);
  return opacity;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// --- Component ---------------------------------------------------------------

export function WaterlineChart({
  eventsInViewport,
  allEvents,
  focalDate,
  todayDate,
  onFocalChange,
  availableMoneyAtFocal,
  startingAvailableMoney,
  attentionCommitmentIds,
  width: widthOverride,
  className,
}: WaterlineChartProps) {
  const rawId = useId().replace(/:/g, "");
  const gradientId = `moneyTraj-${rawId}`;
  const todayBandId = `nowBand-${rawId}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const measuredWidth = useContainerWidth(containerRef, widthOverride ?? 360);
  const width = widthOverride ?? measuredWidth;
  const reducedMotion = usePrefersReducedMotion();

  // Viewport window is focal ± 7 days.
  const viewportStart = useMemo(
    () => addDaysUtc(focalDate, -VIEWPORT_DAYS / 2),
    [focalDate],
  );
  const viewportEnd = useMemo(
    () => addDaysUtc(focalDate, VIEWPORT_DAYS / 2),
    [focalDate],
  );

  const focalIso = toIsoDate(focalDate);
  const todayIso = toIsoDate(todayDate);

  // --- Derived geometry (memoized on inputs) -------------------------------

  const viewportEvents = useMemo(
    () =>
      eventsInViewport.length > 0
        ? eventsInViewport
        : filterEventsInViewport(allEvents, focalDate, VIEWPORT_DAYS / 2),
    [eventsInViewport, allEvents, focalDate],
  );

  const maxAmount = useMemo(() => computeMaxAmountInViewport(viewportEvents), [viewportEvents]);

  const groups = useMemo(() => groupSameDayEvents(viewportEvents), [viewportEvents]);

  const trajectoryPoints = useMemo(
    () =>
      buildAvailableMoneyTrajectory({
        allEvents,
        startingAvailableMoney,
        viewportStart,
        viewportEnd,
      }),
    [allEvents, startingAvailableMoney, viewportStart, viewportEnd],
  );

  const trajectoryStats = useMemo(() => {
    if (trajectoryPoints.length === 0) {
      return { min: 0, max: 0, range: 1 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const point of trajectoryPoints) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }
    const range = Math.max(max - min, 1);
    return { min, max, range };
  }, [trajectoryPoints]);

  const yForValue = useCallback(
    (value: number): number => {
      const { min, range } = trajectoryStats;
      const ratio = (value - min) / range;
      return BELOW_BOTTOM - ratio * TRAJECTORY_RANGE;
    },
    [trajectoryStats],
  );

  const trajectoryCurvePoints = useMemo(
    () =>
      trajectoryPoints.map((point) => ({
        x: xForIsoDate({
          iso: point.iso,
          viewportStart,
          viewportDays: VIEWPORT_DAYS,
          width,
          padX: PAD_X,
        }),
        y: yForValue(point.value),
      })),
    [trajectoryPoints, viewportStart, width, yForValue],
  );

  const trajectoryLinePath = useMemo(
    () => catmullRomPath(trajectoryCurvePoints, 0.5),
    [trajectoryCurvePoints],
  );

  const trajectoryFillPath = useMemo(() => {
    if (trajectoryCurvePoints.length === 0) return "";
    const tail = ` L ${width - PAD_X} ${BELOW_BOTTOM} L ${PAD_X} ${BELOW_BOTTOM} Z`;
    return `${trajectoryLinePath}${tail}`;
  }, [trajectoryCurvePoints, trajectoryLinePath, width]);

  // --- Horizon labels ------------------------------------------------------

  const startLabel = useMemo(() => formatDateLabel(viewportStart), [viewportStart]);
  const endLabel = useMemo(() => formatDateLabel(viewportEnd), [viewportEnd]);
  const middleLabelText = useMemo(
    () => (focalIso === todayIso ? "TODAY" : formatDateLabel(focalDate)),
    [focalIso, todayIso, focalDate],
  );
  const middleLabelIsToday = focalIso === todayIso;

  // --- Gesture handling ----------------------------------------------------

  // Pixels per day: the usable chart width mapped across the viewport.
  const pixelsPerDay = Math.max((width - 2 * PAD_X) / VIEWPORT_DAYS, 1);

  // Keep the latest focal date in a ref so gesture/momentum callbacks, which
  // are created on mount, always see the current value without needing to be
  // recreated on every focal update. Updated in an effect to satisfy the
  // "no ref mutations during render" rule.
  const focalRef = useRef(focalDate);
  useEffect(() => {
    focalRef.current = focalDate;
  }, [focalDate]);

  const gestureRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startFocal: focalDate,
    lastX: 0,
    lastTs: 0,
    velocity: 0,
    pendingRaf: 0,
    pendingDelta: 0,
    momentumRaf: 0,
  });
  const [isGesturing, setIsGesturing] = useState(false);

  const stopMomentum = useCallback(() => {
    if (gestureRef.current.momentumRaf) {
      cancelAnimationFrame(gestureRef.current.momentumRaf);
      gestureRef.current.momentumRaf = 0;
    }
  }, []);

  // Track the previous focal for haptic crossing detection. We fire haptics
  // outside render — a ref avoids re-render thrash.
  const prevFocalForHapticsRef = useRef(focalDate);

  useEffect(() => {
    // Fire haptic feedback when focal crosses events in the loaded set.
    const prev = prevFocalForHapticsRef.current;
    if (toIsoDate(prev) !== toIsoDate(focalDate)) {
      const crossed = detectFocalCrossings({
        previousFocalDate: prev,
        currentFocalDate: focalDate,
        events: allEvents,
        todayIso,
      });
      if (crossed.length > 0) {
        // Prefer the "loudest" crossing on the frame: a pay event outranks a
        // commitment. Rate limit inside the haptics module does the rest.
        const hasIncome = crossed.some((event) => event.type === "income");
        if (hasIncome) hapticPayCrossing();
        else hapticCommitmentCrossing();
      }
    }
    prevFocalForHapticsRef.current = focalDate;
  }, [focalDate, allEvents, todayIso]);

  const emitDelta = useCallback(() => {
    const state = gestureRef.current;
    state.pendingRaf = 0;
    if (state.pendingDelta === 0) return;

    const deltaDays = -state.pendingDelta / pixelsPerDay;
    state.pendingDelta = 0;
    const next = addDaysUtc(focalRef.current, Math.round(deltaDays));
    // Prevent the focal from falling off a whole integer day — additional
    // sub-day motion accumulates until it's worth a whole day.
    if (toIsoDate(next) === toIsoDate(focalRef.current)) {
      // Apply fractional residue on the next frame by keeping the delta
      // pending: leave the delta we already captured as absorbed (it wasn't a
      // whole day anyway) — callers rely on whole-day focal semantics.
      return;
    }
    onFocalChange(next);
  }, [onFocalChange, pixelsPerDay]);

  const queueDelta = useCallback(
    (pixelDelta: number) => {
      const state = gestureRef.current;
      state.pendingDelta += pixelDelta;
      if (state.pendingRaf) return;
      state.pendingRaf = requestAnimationFrame(emitDelta);
    },
    [emitDelta],
  );

  const onPointerDown = useCallback((ev: React.PointerEvent<SVGSVGElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    stopMomentum();
    const state = gestureRef.current;
    state.active = true;
    state.pointerId = ev.pointerId;
    state.startX = ev.clientX;
    state.startFocal = focalRef.current;
    state.lastX = ev.clientX;
    state.lastTs = performance.now();
    state.velocity = 0;
    setIsGesturing(true);
  }, [stopMomentum]);

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      const state = gestureRef.current;
      if (!state.active || ev.pointerId !== state.pointerId) return;
      const now = performance.now();
      const dx = ev.clientX - state.lastX;
      const dt = Math.max(1, now - state.lastTs);
      state.velocity = dx / dt; // pixels per ms
      state.lastX = ev.clientX;
      state.lastTs = now;
      queueDelta(dx);
    },
    [queueDelta],
  );

  const finishGesture = useCallback(() => {
    const state = gestureRef.current;
    state.active = false;
    state.pointerId = -1;
    setIsGesturing(false);

    if (reducedMotion) return;

    // Convert velocity (px/ms) to an initial per-frame delta (px/frame ~= px/16ms).
    let velocity = state.velocity * 16;
    if (Math.abs(velocity) < 0.5) return;

    const decay = 0.92;
    const step = () => {
      if (Math.abs(velocity) < 0.25) {
        state.momentumRaf = 0;
        return;
      }
      queueDelta(velocity);
      velocity *= decay;
      state.momentumRaf = requestAnimationFrame(step);
    };
    state.momentumRaf = requestAnimationFrame(step);
  }, [queueDelta, reducedMotion]);

  const onPointerUp = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      const state = gestureRef.current;
      if (ev.pointerId === state.pointerId) {
        try {
          ev.currentTarget.releasePointerCapture(ev.pointerId);
        } catch {
          // already released
        }
        finishGesture();
      }
    },
    [finishGesture],
  );

  const onPointerCancel = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      if (ev.pointerId === gestureRef.current.pointerId) {
        finishGesture();
      }
    },
    [finishGesture],
  );

  useEffect(() => {
    const gesture = gestureRef.current;
    return () => {
      if (gesture.momentumRaf) cancelAnimationFrame(gesture.momentumRaf);
      if (gesture.pendingRaf) cancelAnimationFrame(gesture.pendingRaf);
      gesture.momentumRaf = 0;
      gesture.pendingRaf = 0;
    };
  }, []);

  // --- Render --------------------------------------------------------------

  const focalDotY = yForValue(availableMoneyAtFocal);
  const nowX = width / 2;

  const ariaLabel = useMemo(() => {
    const dateLabel = middleLabelIsToday
      ? "today"
      : formatReadableDate(focalDate);
    return `Waterline timeline. Focal date ${dateLabel}. ${eventsInViewport.length} events in viewport.`;
  }, [middleLabelIsToday, focalDate, eventsInViewport.length]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full select-none", className)}
      style={{
        touchAction: "pan-y",
        maxWidth: 500,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        width="100%"
        height={SVG_HEIGHT}
        className="block touch-pan-y"
        style={{ cursor: isGesturing ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(142, 196, 168, 0.25)" />
            <stop offset="100%" stopColor="rgba(142, 196, 168, 0)" />
          </linearGradient>
          <radialGradient id={todayBandId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(142, 196, 168, 0.06)" />
            <stop offset="100%" stopColor="rgba(142, 196, 168, 0)" />
          </radialGradient>
        </defs>

        {/* Trajectory fill (bottom layer) */}
        {trajectoryCurvePoints.length >= 2 ? (
          <path d={trajectoryFillPath} fill={`url(#${gradientId})`} stroke="none" />
        ) : null}

        {/* Trajectory line */}
        {trajectoryCurvePoints.length >= 2 ? (
          <path
            d={trajectoryLinePath}
            fill="none"
            stroke="rgba(142, 196, 168, 0.4)"
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        ) : null}

        {/* Waterline baseline */}
        <line
          x1={PAD_X}
          y1={BASELINE_Y}
          x2={width - PAD_X}
          y2={BASELINE_Y}
          stroke="rgba(240, 235, 220, 0.3)"
          strokeWidth={0.75}
        />

        {/* Now line intersection band */}
        <rect
          x={nowX - 40}
          y={ABOVE_BOTTOM}
          width={80}
          height={BELOW_TOP - ABOVE_BOTTOM}
          fill={`url(#${todayBandId})`}
        />

        {/* Now line (dashed, center-pinned) */}
        <line
          x1={nowX}
          y1={ABOVE_TOP}
          x2={nowX}
          y2={BELOW_BOTTOM}
          stroke="rgba(240, 235, 220, 0.15)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />

        {/* NOW label */}
        <text
          x={nowX}
          y={ABOVE_TOP - 8}
          textAnchor="middle"
          fill="var(--keel-safe-soft)"
          style={{ fontSize: 8, letterSpacing: "1.5px", fontWeight: 600 }}
        >
          NOW
        </text>

        {/* Markers */}
        {groups.map((group) => {
          const x = xForIsoDate({
            iso: group.dateIso,
            viewportStart,
            viewportDays: VIEWPORT_DAYS,
            width,
            padX: PAD_X,
          });
          const opacity = opacityForDate(group.dateIso, focalIso, todayIso);
          const normalized = normalizeDepth(group.primary.amount, maxAmount);
          const height = MARKER_MIN_HEIGHT + normalized * MARKER_DEPTH_RANGE;
          const radius = MARKER_MIN_RADIUS + normalized * MARKER_RADIUS_RANGE;
          const isBill = group.type === "bill";
          const commitmentId = isBill ? commitmentIdFromEventId(group.primary.id) : null;
          const isAttention = Boolean(commitmentId && attentionCommitmentIds?.has(commitmentId));
          const isSkipped = Boolean(group.primary.isSkipped);
          const markerY = isBill ? BASELINE_Y + height : BASELINE_Y - height;
          const stemEndY = isBill ? markerY - radius - 1 : markerY + radius + 1;

          const r = isSkipped ? Math.max(2, radius * 0.82) : radius;

          const fill = isSkipped
            ? "none"
            : isBill
              ? isAttention
                ? "var(--keel-attend)"
                : "rgba(240, 235, 220, 0.85)"
              : "#f0ebdc";
          const stroke = isSkipped
            ? "rgba(240, 235, 220, 0.45)"
            : isAttention
              ? "rgba(212, 143, 70, 0.55)"
              : "none";

          return (
            <g key={`${group.dateIso}-${group.type}`} opacity={isSkipped ? opacity * 0.4 : opacity}>
              <line
                x1={x}
                y1={BASELINE_Y}
                x2={x}
                y2={stemEndY}
                stroke="rgba(240, 235, 220, 0.25)"
                strokeWidth={0.75}
              />
              <circle
                cx={x}
                cy={markerY}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSkipped ? 1.1 : isAttention ? 0.75 : 0}
              />
              {group.companions.map((companion, idx) => (
                <circle
                  key={companion.id}
                  cx={x + COMPANION_OFFSET + idx * 1.5}
                  cy={markerY + (isBill ? COMPANION_OFFSET : -COMPANION_OFFSET)}
                  r={r * COMPANION_RADIUS_SCALE}
                  fill={isSkipped ? "none" : fill}
                  stroke={isSkipped ? "rgba(240, 235, 220, 0.35)" : stroke}
                  strokeWidth={isSkipped ? 0.9 : 0}
                  opacity={isSkipped ? 0.4 : 0.7}
                />
              ))}
            </g>
          );
        })}

        {/* Focal dot + pulse ring */}
        <g>
          <circle
            cx={nowX}
            cy={focalDotY}
            r={7}
            fill="none"
            stroke="rgba(142, 196, 168, 0.4)"
            strokeWidth={1}
            className={cn(
              !reducedMotion && !isGesturing && "waterline-focal-pulse",
            )}
          />
          <circle
            cx={nowX}
            cy={focalDotY}
            r={4}
            fill="var(--keel-safe-soft)"
            style={
              reducedMotion
                ? undefined
                : { transition: "cy 280ms cubic-bezier(0.34, 1.56, 0.64, 1)" }
            }
          />
        </g>

        {/* Bottom date labels */}
        <text
          x={PAD_X}
          y={LABEL_Y}
          textAnchor="start"
          fill="#5f645e"
          style={{ fontSize: 8, letterSpacing: "0.8px", fontWeight: 500 }}
        >
          {startLabel}
        </text>
        <text
          x={nowX}
          y={LABEL_Y}
          textAnchor="middle"
          fill={middleLabelIsToday ? "rgba(168, 215, 189, 1)" : "#5f645e"}
          style={{ fontSize: 8, letterSpacing: "0.8px", fontWeight: 500 }}
        >
          {middleLabelText}
        </text>
        <text
          x={width - PAD_X}
          y={LABEL_Y}
          textAnchor="end"
          fill="#5f645e"
          style={{ fontSize: 8, letterSpacing: "0.8px", fontWeight: 500 }}
        >
          {endLabel}
        </text>
      </svg>

      <style>{`
        @keyframes waterline-focal-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.15; }
        }
        .waterline-focal-pulse {
          animation: waterline-focal-pulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .waterline-focal-pulse {
            animation: none;
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

// --- Formatting helpers ------------------------------------------------------

function formatDateLabel(date: Date): string {
  return startOfUtcDay(date)
    .toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}

function formatReadableDate(date: Date): string {
  return startOfUtcDay(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
