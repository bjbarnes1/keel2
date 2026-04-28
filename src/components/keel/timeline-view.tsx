"use client";

/**
 * TimelineView — non-scrolling weekly forecast + editable 30-day scenario table.
 *
 * Loads a long projection window once, then applies draft occurrence-date
 * overrides client-side for instant what-if feedback. Confirmation persists
 * those occurrence moves as recurrence-linked overrides.
 *
 * @module components/keel/timeline-view
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { loadProjectionChunk } from "@/app/actions/keel";
import { confirmTimelineOccurrenceOverrides } from "@/app/actions/timeline-occurrence-overrides";
import { TimelineLegend } from "@/components/keel/timeline-legend";
import { WaterlineChart } from "@/components/keel/waterline-chart";
import type { ProjectionEvent } from "@/lib/engine/keel";
import type { OccurrenceDateOverrideInput } from "@/lib/types";
import {
  addDaysUtc,
  addMonthsUtc,
  applyDraftOccurrenceOverridesToProjection,
  buildTimelineTableRows,
  buildWeeklyCashflowBuckets,
  fromIsoDate,
  startOfUtcDay,
  startOfUtcMonth,
  toIsoDate,
} from "@/lib/timeline/waterline-geometry";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

const TIMELINE_HORIZON_DAYS = 420;
const TABLE_WINDOW_DAYS = 30;

type ChartRangeSelection = "auto" | "12" | "9" | "6" | "3";

function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function autoRangeMonthsForWidth(width: number): 12 | 9 | 6 | 3 {
  if (width >= 1280) return 12;
  if (width >= 1024) return 9;
  if (width >= 760) return 6;
  return 3;
}

function parseManualRange(selection: ChartRangeSelection): 12 | 9 | 6 | 3 {
  if (selection === "12") return 12;
  if (selection === "9") return 9;
  if (selection === "6") return 6;
  return 3;
}

function minDate(left: Date, right: Date) {
  return left.getTime() < right.getTime() ? left : right;
}

function clampIsoDate(iso: string, minIso: string, maxIso: string) {
  if (iso < minIso) return minIso;
  if (iso > maxIso) return maxIso;
  return iso;
}

export type AnnualTotals = {
  annualIncomeForecast: number;
  annualCommitmentsForecast: number;
  annualSpendActualToDate: number;
};

export type TimelineViewProps = {
  balanceAsOfIso: string;
  startingAvailableMoney: number;
  startingBankBalance: number;
  /** Surface a message when the user has nothing scheduled yet. */
  hasAnyScheduledEvents: boolean;
  annualTotals: AnnualTotals;
};

export function TimelineView({
  balanceAsOfIso,
  startingAvailableMoney,
  startingBankBalance,
  hasAnyScheduledEvents,
  annualTotals,
}: TimelineViewProps) {
  const asOfDate = useMemo(() => fromIsoDate(balanceAsOfIso), [balanceAsOfIso]);
  const [projectionEvents, setProjectionEvents] = useState<ProjectionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [rangeSelection, setRangeSelection] = useState<ChartRangeSelection>("auto");
  const [chartAnchorMonth, setChartAnchorMonth] = useState<Date>(() => startOfUtcMonth(asOfDate));
  const [tableWindowStart, setTableWindowStart] = useState<Date>(() => startOfUtcDay(asOfDate));
  const [selectedWeekStartIso, setSelectedWeekStartIso] = useState<string | null>(null);
  const [draftOverridesByKey, setDraftOverridesByKey] = useState<
    Record<string, OccurrenceDateOverrideInput>
  >({});

  const viewportWidth = useViewportWidth();
  const autoRangeMonths = autoRangeMonthsForWidth(viewportWidth);
  const rangeMonths =
    rangeSelection === "auto" ? autoRangeMonths : parseManualRange(rangeSelection);
  const maxHorizonDate = useMemo(
    () => addDaysUtc(asOfDate, TIMELINE_HORIZON_DAYS),
    [asOfDate],
  );
  const maxHorizonIso = toIsoDate(maxHorizonDate);

  const reloadProjection = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const events = await loadProjectionChunk({
        startDateIso: balanceAsOfIso,
        horizonDays: TIMELINE_HORIZON_DAYS,
      });
      setProjectionEvents(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your timeline.");
    } finally {
      setIsLoading(false);
    }
  }, [balanceAsOfIso]);

  useEffect(() => {
    void reloadProjection();
  }, [reloadProjection]);

  const draftOverrides = useMemo(
    () => Object.values(draftOverridesByKey),
    [draftOverridesByKey],
  );

  const projectedEvents = useMemo(
    () =>
      applyDraftOccurrenceOverridesToProjection({
        events: projectionEvents,
        startingAvailableMoney,
        overrides: draftOverrides,
      }),
    [projectionEvents, startingAvailableMoney, draftOverrides],
  );

  const chartRangeStart = useMemo(() => startOfUtcMonth(chartAnchorMonth), [chartAnchorMonth]);
  const chartRangeEndWanted = useMemo(
    () => addDaysUtc(addMonthsUtc(chartRangeStart, rangeMonths), -1),
    [chartRangeStart, rangeMonths],
  );
  const chartRangeEnd = useMemo(
    () => minDate(chartRangeEndWanted, maxHorizonDate),
    [chartRangeEndWanted, maxHorizonDate],
  );

  const weeklyBuckets = useMemo(
    () =>
      buildWeeklyCashflowBuckets({
        events: projectedEvents,
        startingAvailableMoney,
        startingBankBalance,
        windowStart: chartRangeStart,
        windowEnd: chartRangeEnd,
      }),
    [projectedEvents, startingAvailableMoney, startingBankBalance, chartRangeStart, chartRangeEnd],
  );

  useEffect(() => {
    if (weeklyBuckets.length === 0) {
      setSelectedWeekStartIso(null);
      return;
    }
    if (!selectedWeekStartIso) {
      setSelectedWeekStartIso(weeklyBuckets[0]!.weekStartIso);
      return;
    }
    if (!weeklyBuckets.some((bucket) => bucket.weekStartIso === selectedWeekStartIso)) {
      setSelectedWeekStartIso(weeklyBuckets[0]!.weekStartIso);
    }
  }, [weeklyBuckets, selectedWeekStartIso]);

  const chartRangeLabel = useMemo(() => {
    const modeLabel = rangeSelection === "auto" ? `Auto (${autoRangeMonths} months)` : `${rangeMonths} months`;
    return `${formatDisplayDate(toIsoDate(chartRangeStart), "short")} to ${formatDisplayDate(
      toIsoDate(chartRangeEnd),
      "short",
    )} · ${modeLabel}`;
  }, [autoRangeMonths, chartRangeEnd, chartRangeStart, rangeMonths, rangeSelection]);

  const tableWindowStartIso = toIsoDate(tableWindowStart);
  const tableRows = useMemo(
    () =>
      buildTimelineTableRows({
        events: projectedEvents,
        startingAvailableMoney,
        startingBankBalance,
        windowStartIso: tableWindowStartIso,
        days: TABLE_WINDOW_DAYS,
      }),
    [projectedEvents, startingAvailableMoney, startingBankBalance, tableWindowStartIso],
  );
  const tableWindowEndIso = toIsoDate(
    addDaysUtc(fromIsoDate(tableWindowStartIso), TABLE_WINDOW_DAYS - 1),
  );

  const chartCanPrev =
    addMonthsUtc(chartAnchorMonth, -1).getTime() >= startOfUtcMonth(asOfDate).getTime();
  const chartCanNext =
    addDaysUtc(addMonthsUtc(addMonthsUtc(chartAnchorMonth, 1), rangeMonths), -1).getTime() <=
    maxHorizonDate.getTime();
  const tableCanPrev =
    addMonthsUtc(tableWindowStart, -1).getTime() >= startOfUtcDay(asOfDate).getTime();
  const tableCanNext =
    addDaysUtc(addMonthsUtc(tableWindowStart, 1), TABLE_WINDOW_DAYS - 1).getTime() <=
    maxHorizonDate.getTime();

  const setRowScheduledDate = useCallback(
    (row: (typeof tableRows)[number], nextIsoInput: string) => {
      const kind = row.sourceKind;
      const sourceId = row.sourceId;
      const originalDateIso = row.originalDateIso;
      if (!kind || !sourceId || !originalDateIso) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextIsoInput)) return;

      const nextIso = clampIsoDate(nextIsoInput, balanceAsOfIso, maxHorizonIso);
      const key = `${kind}:${sourceId}:${originalDateIso}`;

      setDraftOverridesByKey((prev) => {
        if (nextIso === originalDateIso) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return {
          ...prev,
          [key]: {
            kind,
            sourceId,
            originalDateIso,
            scheduledDateIso: nextIso,
          },
        };
      });
    },
    [balanceAsOfIso, maxHorizonIso],
  );

  const handleMoveByDays = useCallback(
    (row: (typeof tableRows)[number], days: number) => {
      const nextIso = toIsoDate(addDaysUtc(fromIsoDate(row.dateIso), days));
      setRowScheduledDate(row, nextIso);
    },
    [setRowScheduledDate],
  );

  const undoDraft = useCallback(() => {
    setDraftOverridesByKey({});
    setConfirmError(null);
  }, []);

  const confirmDraft = useCallback(async () => {
    if (draftOverrides.length === 0) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      await confirmTimelineOccurrenceOverrides({ overrides: draftOverrides });
      setDraftOverridesByKey({});
      await reloadProjection();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Could not save your scenario changes.");
    } finally {
      setIsConfirming(false);
    }
  }, [draftOverrides, reloadProjection]);

  // Empty state — no events at all (brand-new user with no incomes/commitments).
  if (!hasAnyScheduledEvents) {
    return (
      <div className="flex flex-col gap-5">
        <div className="glass-clear flex flex-col items-center rounded-[var(--radius-md)] px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--keel-ink-2)]">
            Your timeline will fill in as you add income and commitments.
          </p>
          <Link
            href="/commitments"
            className="glass-tint-safe mt-5 rounded-[var(--radius-pill)] px-5 py-2 text-[13px] font-medium text-[color:var(--keel-ink)] transition-opacity hover:opacity-90"
          >
            Add a commitment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <section className="glass-clear rounded-[var(--radius-md)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["auto", "12", "9", "6", "3"] as const).map((option) => {
                const active = rangeSelection === option;
                const label =
                  option === "auto"
                    ? `Auto (${autoRangeMonths}m)`
                    : `${option}m`;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRangeSelection(option)}
                    className={cn(
                      "rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-medium",
                      active
                        ? "border-transparent bg-[#2f7fce] text-white"
                        : "border-[color:var(--color-border)] text-[color:var(--keel-ink)]",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChartAnchorMonth((prev) => addMonthsUtc(prev, -1))}
                disabled={!chartCanPrev}
                className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Previous month
              </button>
              <button
                type="button"
                onClick={() => setChartAnchorMonth((prev) => addMonthsUtc(prev, 1))}
                disabled={!chartCanNext}
                className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next month
              </button>
            </div>
          </div>
        </section>

        <WaterlineChart
          weeklyBuckets={weeklyBuckets}
          selectedWeekStartIso={selectedWeekStartIso}
          onSelectWeek={setSelectedWeekStartIso}
          rangeLabel={chartRangeLabel}
          className="mt-3"
        />

        {isLoading ? <TimelineShimmer /> : null}
      </div>

      {error ? (
        <div className="glass-tint-attend rounded-[var(--radius-sm)] px-4 py-3 text-[12px] text-[color:var(--keel-ink-2)]">
          {error}
        </div>
      ) : null}

      <TimelineLegend
        rows={tableRows}
        windowStartIso={tableWindowStartIso}
        windowEndIso={tableWindowEndIso}
        onPrevMonth={() => setTableWindowStart((prev) => addMonthsUtc(prev, -1))}
        onNextMonth={() => setTableWindowStart((prev) => addMonthsUtc(prev, 1))}
        canPrevMonth={tableCanPrev}
        canNextMonth={tableCanNext}
        onMoveByDays={handleMoveByDays}
        onSetDate={setRowScheduledDate}
        draftCount={draftOverrides.length}
        onUndoDraft={undoDraft}
        onConfirmDraft={confirmDraft}
        isConfirming={isConfirming}
        error={confirmError}
      />

      <AnnualTotalsStrip totals={annualTotals} />
    </div>
  );
}

function TimelineShimmer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-sm)]"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200% 100%",
        animation: "keel-timeline-shimmer 1.6s linear infinite",
      }}
    >
      <style>{`
        @keyframes keel-timeline-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] { animation: none; }
        }
      `}</style>
    </div>
  );
}

function AnnualTotalsStrip({ totals }: { totals: AnnualTotals }) {
  return (
    <section className="glass-clear rounded-[var(--radius-md)] px-4 py-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Annual income (forecast)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualIncomeForecast)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Annual commitments (forecast)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualCommitmentsForecast)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Spend allocated to commitments (last 12 months)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualSpendActualToDate)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[color:var(--keel-ink-4)]">
        Forecasts are what we expect; spend is what we&apos;ve tracked.
      </p>
    </section>
  );
}
