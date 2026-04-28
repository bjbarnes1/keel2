"use client";

/**
 * Timeline cashflow chart.
 *
 * The chart keeps the existing sync contract: dragging the graph changes focal date,
 * and the legend/table below can still drive the same focal date through `TimelineView`.
 *
 * Interaction: high-frequency pointer deltas update an SVG `translate` on the plot
 * group (refs + rAF) so motion stays smooth; `onFocalChange` fires at most once per
 * frame and only when the scrub crosses a new whole-day boundary (plus a final
 * nearest-day snap on release / momentum end).
 * Visual model:
 * - green income bars above the cashflow axis
 * - orange commitment bars below the cashflow axis
 * - blue projected bank-balance line across the window
 * - summary cards for income, commitments, net, and lowest balance
 *
 * @module components/keel/waterline-chart
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectionEvent } from "@/lib/engine/keel";
import {
  addDaysUtc,
  buildBankBalanceTrajectory,
  catmullRomPath,
  detectFocalCrossings,
  dragPixelsToWholeDayShift,
  dragRemainderPixelsAfterWholeDayShift,
  filterEventsInViewport,
  startOfUtcDay,
  toIsoDate,
  xForIsoDate,
} from "@/lib/timeline/waterline-geometry";
import { hapticCommitmentCrossing, hapticPayCrossing } from "@/lib/haptics";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

const VIEWPORT_DAYS = 28;
const SVG_HEIGHT = 420;
const PAD_X = 34;
const PLOT_TOP = 56;
const BALANCE_TOP = 74;
const CASH_AXIS_Y = 268;
const PLOT_BOTTOM = 350;
const LABEL_Y = 388;
const BAR_RANGE = 128;

type DayCashflow = {
  iso: string;
  income: number;
  commitments: number;
};

export type WaterlineChartProps = {
  eventsInViewport: ProjectionEvent[];
  allEvents: ProjectionEvent[];
  focalDate: Date;
  todayDate: Date;
  onFocalChange: (date: Date) => void;
  availableMoneyAtFocal: number;
  startingAvailableMoney: number;
  startingBankBalance: number;
  attentionCommitmentIds?: ReadonlySet<string>;
  width?: number;
  className?: string;
};

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

function buildDayCashflows(events: readonly ProjectionEvent[]): DayCashflow[] {
  const byIso = new Map<string, DayCashflow>();
  for (const event of events) {
    const row = byIso.get(event.date) ?? { iso: event.date, income: 0, commitments: 0 };
    if (event.type === "income") row.income += Math.max(0, event.amount);
    else row.commitments += Math.abs(event.amount);
    byIso.set(event.date, row);
  }
  return Array.from(byIso.values()).sort((a, b) => a.iso.localeCompare(b.iso));
}

function valueStats(points: Array<{ iso: string; value: number }>) {
  if (points.length === 0) return { min: 0, max: 0, range: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }
  return { min, max, range: Math.max(max - min, 1) };
}

function balanceAtFocal(input: {
  startingBankBalance: number;
  startingAvailableMoney: number;
  availableMoneyAtFocal: number;
}) {
  return input.startingBankBalance + (input.availableMoneyAtFocal - input.startingAvailableMoney);
}

export function WaterlineChart({
  eventsInViewport,
  allEvents,
  focalDate,
  todayDate,
  onFocalChange,
  availableMoneyAtFocal,
  startingAvailableMoney,
  startingBankBalance,
  width: widthOverride,
  className,
}: WaterlineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measuredWidth = useContainerWidth(containerRef, widthOverride ?? 720);
  const width = widthOverride ?? measuredWidth;
  const reducedMotion = usePrefersReducedMotion();
  const pixelsPerDay = Math.max((width - 2 * PAD_X) / VIEWPORT_DAYS, 1);

  const viewportStart = useMemo(() => addDaysUtc(focalDate, -VIEWPORT_DAYS / 2), [focalDate]);
  const viewportEnd = useMemo(() => addDaysUtc(focalDate, VIEWPORT_DAYS / 2), [focalDate]);
  const focalIso = toIsoDate(focalDate);
  const todayIso = toIsoDate(todayDate);
  const nowX = width / 2;

  const viewportEvents = useMemo(
    () =>
      eventsInViewport.length > 0
        ? eventsInViewport
        : filterEventsInViewport(allEvents, focalDate, VIEWPORT_DAYS / 2),
    [allEvents, eventsInViewport, focalDate],
  );

  const dayCashflows = useMemo(() => buildDayCashflows(viewportEvents), [viewportEvents]);
  const maxCashflow = useMemo(
    () => Math.max(1, ...dayCashflows.flatMap((d) => [d.income, d.commitments])),
    [dayCashflows],
  );

  const balancePoints = useMemo(
    () =>
      buildBankBalanceTrajectory({
        allEvents,
        startingAvailableMoney,
        startingBankBalance,
        viewportStart,
        viewportEnd,
      }),
    [allEvents, startingAvailableMoney, startingBankBalance, viewportStart, viewportEnd],
  );

  const balanceStats = useMemo(() => valueStats(balancePoints), [balancePoints]);
  const yForBalance = useCallback(
    (value: number) => {
      const ratio = (value - balanceStats.min) / balanceStats.range;
      return PLOT_BOTTOM - ratio * (PLOT_BOTTOM - BALANCE_TOP);
    },
    [balanceStats],
  );

  const balanceCurvePoints = useMemo(
    () =>
      balancePoints.map((point) => ({
        x: xForIsoDate({
          iso: point.iso,
          viewportStart,
          viewportDays: VIEWPORT_DAYS,
          width,
          padX: PAD_X,
        }),
        y: yForBalance(point.value),
      })),
    [balancePoints, viewportStart, width, yForBalance],
  );

  const balanceLinePath = useMemo(
    () => catmullRomPath(balanceCurvePoints, 0.45),
    [balanceCurvePoints],
  );

  const projectedBalance = balanceAtFocal({
    startingBankBalance,
    startingAvailableMoney,
    availableMoneyAtFocal,
  });
  const focalDotY = yForBalance(projectedBalance);

  const windowIncome = dayCashflows.reduce((sum, d) => sum + d.income, 0);
  const windowCommitments = dayCashflows.reduce((sum, d) => sum + d.commitments, 0);
  const net = windowIncome - windowCommitments;
  const lowest = balancePoints.reduce(
    (min, point) => (point.value < min.value ? point : min),
    balancePoints[0] ?? { iso: focalIso, value: projectedBalance },
  );

  const startLabel = formatDisplayDate(toIsoDate(viewportStart), "short");
  const endLabel = formatDisplayDate(toIsoDate(viewportEnd), "short");
  const focalLabel = formatDisplayDate(focalIso, "short-day");

  const plotGroupRef = useRef<SVGGElement | null>(null);
  const dragPxRef = useRef(0);
  const anchorDateRef = useRef<Date>(focalDate);
  const gestureRef = useRef({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastTs: 0,
    velocity: 0,
  });
  const interactionRafRef = useRef(0);
  const momentumRafRef = useRef(0);
  const pixelsPerDayRef = useRef(pixelsPerDay);
  const onFocalChangeRef = useRef(onFocalChange);
  const focalRef = useRef(focalDate);
  /** True from pointer-down until nearest-day settle (includes inertial momentum). */
  const chartBusyRef = useRef(false);
  const [isGesturing, setIsGesturing] = useState(false);

  useEffect(() => {
    onFocalChangeRef.current = onFocalChange;
  }, [onFocalChange]);

  useEffect(() => {
    focalRef.current = focalDate;
  }, [focalDate]);

  useEffect(() => {
    pixelsPerDayRef.current = pixelsPerDay;
  }, [pixelsPerDay]);

  useEffect(() => {
    return () => {
      if (interactionRafRef.current) cancelAnimationFrame(interactionRafRef.current);
      if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
      interactionRafRef.current = 0;
      momentumRafRef.current = 0;
    };
  }, []);

  const applyPlotTransform = useCallback((remainderPx: number) => {
    const node = plotGroupRef.current;
    if (!node) return;
    if (!remainderPx) {
      node.setAttribute("transform", "translate(0 0)");
    } else {
      node.setAttribute("transform", `translate(${remainderPx} 0)`);
    }
  }, []);

  /** Clears drag state when the legend (or anything else) moves focal while idle. */
  useEffect(() => {
    if (chartBusyRef.current) return;
    dragPxRef.current = 0;
    applyPlotTransform(0);
  }, [focalIso, width, applyPlotTransform]);

  const prevFocalForHapticsRef = useRef(focalDate);
  useEffect(() => {
    const prev = prevFocalForHapticsRef.current;
    if (toIsoDate(prev) !== focalIso) {
      const crossed = detectFocalCrossings({
        previousFocalDate: prev,
        currentFocalDate: focalDate,
        events: allEvents,
        todayIso,
      });
      if (crossed.length > 0) {
        const hasIncome = crossed.some((event) => event.type === "income");
        if (hasIncome) hapticPayCrossing();
        else hapticCommitmentCrossing();
      }
    }
    prevFocalForHapticsRef.current = focalDate;
  }, [allEvents, focalDate, focalIso, todayIso]);

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = 0;
    }
  }, []);

  const settleToNearestDay = useCallback(() => {
    if (interactionRafRef.current) {
      cancelAnimationFrame(interactionRafRef.current);
      interactionRafRef.current = 0;
    }
    const ppd = pixelsPerDayRef.current;
    const dragPx = dragPxRef.current;
    const nearestShift = Math.round(-dragPx / ppd);
    const finalDate = addDaysUtc(startOfUtcDay(anchorDateRef.current), nearestShift);
    if (toIsoDate(finalDate) !== toIsoDate(focalRef.current)) {
      onFocalChangeRef.current(finalDate);
      focalRef.current = finalDate;
    }
    dragPxRef.current = 0;
    applyPlotTransform(0);
    chartBusyRef.current = false;
  }, [applyPlotTransform]);

  const runInteractionFrame = useCallback(() => {
    interactionRafRef.current = 0;
    const ppd = pixelsPerDayRef.current;
    const dragPx = dragPxRef.current;
    const remainder = dragRemainderPixelsAfterWholeDayShift(dragPx, ppd);
    applyPlotTransform(remainder);

    const shiftDays = dragPixelsToWholeDayShift(dragPx, ppd);
    const target = addDaysUtc(startOfUtcDay(anchorDateRef.current), shiftDays);
    const targetIso = toIsoDate(target);
    if (targetIso !== toIsoDate(focalRef.current)) {
      onFocalChangeRef.current(target);
      focalRef.current = target;
    }
  }, [applyPlotTransform]);

  const scheduleInteractionFrame = useCallback(() => {
    if (interactionRafRef.current) return;
    interactionRafRef.current = requestAnimationFrame(runInteractionFrame);
  }, [runInteractionFrame]);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      stopMomentum();
      chartBusyRef.current = true;
      dragPxRef.current = 0;
      anchorDateRef.current = startOfUtcDay(focalDate);
      applyPlotTransform(0);
      const state = gestureRef.current;
      state.active = true;
      state.pointerId = ev.pointerId;
      state.lastX = ev.clientX;
      state.lastTs = performance.now();
      state.velocity = 0;
      setIsGesturing(true);
    },
    [applyPlotTransform, focalDate, stopMomentum],
  );

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      const state = gestureRef.current;
      if (!state.active || ev.pointerId !== state.pointerId) return;
      const now = performance.now();
      const dx = ev.clientX - state.lastX;
      const dt = Math.max(1, now - state.lastTs);
      state.velocity = dx / dt;
      state.lastX = ev.clientX;
      state.lastTs = now;
      dragPxRef.current += dx;
      scheduleInteractionFrame();
    },
    [scheduleInteractionFrame],
  );

  const finishGesture = useCallback(() => {
    const state = gestureRef.current;
    state.active = false;
    state.pointerId = -1;
    setIsGesturing(false);

    if (reducedMotion) {
      settleToNearestDay();
      return;
    }

    let velocity = state.velocity * 16;
    if (Math.abs(velocity) < 0.5) {
      settleToNearestDay();
      return;
    }

    const decay = 0.92;
    const step = () => {
      if (Math.abs(velocity) < 0.25) {
        momentumRafRef.current = 0;
        settleToNearestDay();
        return;
      }
      dragPxRef.current += velocity;
      velocity *= decay;
      scheduleInteractionFrame();
      momentumRafRef.current = requestAnimationFrame(step);
    };
    momentumRafRef.current = requestAnimationFrame(step);
  }, [reducedMotion, scheduleInteractionFrame, settleToNearestDay]);

  const onPointerUp = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      const state = gestureRef.current;
      if (ev.pointerId !== state.pointerId) return;
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch {
        // already released
      }
      finishGesture();
    },
    [finishGesture],
  );

  const ariaLabel = `Timeline cashflow chart. Centered on ${focalLabel}. Projected balance ${formatAud(
    projectedBalance,
  )}.`;

  return (
    <section className={cn("glass-clear rounded-[var(--radius-xl)] p-4 lg:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[color:var(--keel-ink-4)]">Centred date</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{focalLabel}</p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--keel-ink-4)]">Projected balance</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#2f7fce]">
              {formatAud(projectedBalance)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[color:var(--keel-ink-4)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#2bbf9b]" /> Income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#d76d45]" /> Commitments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-6 bg-[#2f7fce]" /> Balance
          </span>
        </div>
      </div>

      <div ref={containerRef} className="mt-4 w-full select-none" style={{ touchAction: "pan-y" }}>
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
          onPointerCancel={onPointerUp}
        >
          <defs>
            <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(47,127,206,0.22)" />
              <stop offset="100%" stopColor="rgba(47,127,206,0.02)" />
            </linearGradient>
          </defs>

          <g ref={plotGroupRef} transform="translate(0 0)">
            <rect
              x={PAD_X}
              y={PLOT_TOP}
              width={Math.max(0, width - PAD_X * 2)}
              height={PLOT_BOTTOM - PLOT_TOP}
              rx={24}
              fill="color-mix(in oklab, var(--keel-ink), transparent 97%)"
            />

            <line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={CASH_AXIS_Y}
              y2={CASH_AXIS_Y}
              stroke="color-mix(in oklab, var(--keel-ink), transparent 78%)"
              strokeWidth={1}
              strokeDasharray="6 8"
            />

            {balanceCurvePoints.length >= 2 ? (
              <path
                d={`${balanceLinePath} L ${width - PAD_X} ${PLOT_BOTTOM} L ${PAD_X} ${PLOT_BOTTOM} Z`}
                fill="url(#balance-fill)"
                stroke="none"
              />
            ) : null}

            {dayCashflows.map((day) => {
              const x = xForIsoDate({
                iso: day.iso,
                viewportStart,
                viewportDays: VIEWPORT_DAYS,
                width,
                padX: PAD_X,
              });
              const barWidth = Math.max(5, Math.min(12, (width - PAD_X * 2) / VIEWPORT_DAYS / 2.6));
              const incomeHeight = (day.income / maxCashflow) * BAR_RANGE;
              const commitmentHeight = (day.commitments / maxCashflow) * BAR_RANGE;
              return (
                <g key={day.iso}>
                  {day.income > 0 ? (
                    <rect
                      x={x - barWidth / 2}
                      y={CASH_AXIS_Y - incomeHeight}
                      width={barWidth}
                      height={incomeHeight}
                      rx={barWidth / 2}
                      fill="#2bbf9b"
                      opacity={day.iso < todayIso ? 0.45 : 0.9}
                    />
                  ) : null}
                  {day.commitments > 0 ? (
                    <rect
                      x={x - barWidth / 2}
                      y={CASH_AXIS_Y}
                      width={barWidth}
                      height={commitmentHeight}
                      rx={barWidth / 2}
                      fill="#d76d45"
                      opacity={day.iso < todayIso ? 0.45 : 0.9}
                    />
                  ) : null}
                </g>
              );
            })}

            {balanceCurvePoints.length >= 2 ? (
              <path
                d={balanceLinePath}
                fill="none"
                stroke="#2f7fce"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            <text x={PAD_X} y={LABEL_Y} fill="var(--keel-ink-5)" style={{ fontSize: 10 }}>
              {startLabel}
            </text>
            <text
              x={width - PAD_X}
              y={LABEL_Y}
              textAnchor="end"
              fill="var(--keel-ink-5)"
              style={{ fontSize: 10 }}
            >
              {endLabel}
            </text>
          </g>

          <line
            x1={nowX}
            x2={nowX}
            y1={PLOT_TOP + 6}
            y2={PLOT_BOTTOM - 4}
            stroke="color-mix(in oklab, var(--keel-ink), transparent 74%)"
            strokeWidth={1}
          />

          <g>
            <rect
              x={nowX - 46}
              y={PLOT_TOP - 26}
              width={92}
              height={26}
              rx={8}
              fill="var(--color-card)"
              stroke="color-mix(in oklab, var(--keel-ink), transparent 86%)"
            />
            <text
              x={nowX}
              y={PLOT_TOP - 9}
              textAnchor="middle"
              fill="var(--keel-ink)"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {focalLabel}
            </text>
          </g>

          <circle
            cx={nowX}
            cy={focalDotY}
            r={7}
            fill="var(--color-card)"
            stroke="#2f7fce"
            strokeWidth={3}
          />
        </svg>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Window income" value={windowIncome} tone="income" />
        <MetricCard label="Window commitments" value={windowCommitments} tone="commitment" />
        <MetricCard label="Net" value={net} tone={net >= 0 ? "balance" : "commitment"} />
        <MetricCard
          label="Lowest balance"
          value={lowest.value}
          tone={lowest.value >= 0 ? "balance" : "commitment"}
          suffix={` · ${formatDisplayDate(lowest.iso, "short")}`}
        />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  tone: "income" | "commitment" | "balance";
  suffix?: string;
}) {
  const color =
    tone === "income" ? "#1e8f6a" : tone === "commitment" ? "#c75f3b" : "#2f7fce";
  return (
    <div className="rounded-[var(--radius-md)] bg-[color:var(--color-card)] p-4 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.18)]">
      <p className="text-sm text-[color:var(--keel-ink-3)]">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums" style={{ color }}>
        {formatAud(value)}
        {suffix ? <span className="text-[color:var(--keel-ink-3)]">{suffix}</span> : null}
      </p>
    </div>
  );
}

