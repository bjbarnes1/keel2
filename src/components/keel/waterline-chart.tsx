"use client";

/**
 * Weekly timeline forecast chart (non-scrolling).
 *
 * Renders fixed weekly income/commitment bars and a smooth closing-balance line
 * for the current chart range. Clicking a week selects it and surfaces the
 * closing balance details.
 *
 * @module components/keel/waterline-chart
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WeeklyCashflowBucket } from "@/lib/timeline/waterline-geometry";
import { catmullRomPath } from "@/lib/timeline/waterline-geometry";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

const SVG_HEIGHT = 360;
const PAD_X = 28;
const CHART_TOP = 44;
const CHART_BOTTOM = 292;
const CASH_AXIS_Y = 212;
const BALANCE_TOP = 62;
const BALANCE_BOTTOM = 186;
const BAR_RANGE = 88;

export type WaterlineChartProps = {
  weeklyBuckets: WeeklyCashflowBucket[];
  selectedWeekStartIso: string | null;
  onSelectWeek: (weekStartIso: string) => void;
  rangeLabel: string;
  className?: string;
};

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

function valueStats(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, range: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max, range: Math.max(1, max - min) };
}

export function WaterlineChart({
  weeklyBuckets,
  selectedWeekStartIso,
  onSelectWeek,
  rangeLabel,
  className,
}: WaterlineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 900);
  const plotWidth = Math.max(1, width - PAD_X * 2);
  const bucketCount = Math.max(1, weeklyBuckets.length);
  const bucketSlot = plotWidth / bucketCount;
  const barWidth = Math.max(5, Math.min(18, bucketSlot * 0.42));

  const selectedBucket = useMemo(() => {
    if (weeklyBuckets.length === 0) return null;
    return (
      weeklyBuckets.find((bucket) => bucket.weekStartIso === selectedWeekStartIso) ??
      weeklyBuckets[0]
    );
  }, [selectedWeekStartIso, weeklyBuckets]);

  const selectedIndex = useMemo(() => {
    if (!selectedBucket) return 0;
    const idx = weeklyBuckets.findIndex((bucket) => bucket.weekStartIso === selectedBucket.weekStartIso);
    return idx < 0 ? 0 : idx;
  }, [selectedBucket, weeklyBuckets]);

  const maxCashflow = useMemo(
    () =>
      Math.max(
        1,
        ...weeklyBuckets.flatMap((bucket) => [bucket.income, bucket.commitments]),
      ),
    [weeklyBuckets],
  );

  const balanceStats = useMemo(
    () => valueStats(weeklyBuckets.map((bucket) => bucket.closingBankBalance)),
    [weeklyBuckets],
  );

  const yForBalance = useCallback(
    (balance: number) => {
      const ratio = (balance - balanceStats.min) / balanceStats.range;
      return BALANCE_BOTTOM - ratio * (BALANCE_BOTTOM - BALANCE_TOP);
    },
    [balanceStats],
  );

  const linePoints = useMemo(
    () =>
      weeklyBuckets.map((bucket, index) => ({
        x: PAD_X + bucketSlot * index + bucketSlot / 2,
        y: yForBalance(bucket.closingBankBalance),
      })),
    [weeklyBuckets, bucketSlot, yForBalance],
  );

  const balancePath = useMemo(() => catmullRomPath(linePoints, 0.48), [linePoints]);
  const selectedX = PAD_X + bucketSlot * selectedIndex + bucketSlot / 2;
  const selectedY = selectedBucket ? yForBalance(selectedBucket.closingBankBalance) : BALANCE_BOTTOM;

  const windowIncome = weeklyBuckets.reduce((sum, bucket) => sum + bucket.income, 0);
  const windowCommitments = weeklyBuckets.reduce((sum, bucket) => sum + bucket.commitments, 0);
  const net = windowIncome - windowCommitments;
  const lowestBalance = weeklyBuckets.reduce(
    (min, bucket) => (bucket.closingBankBalance < min.closingBankBalance ? bucket : min),
    weeklyBuckets[0] ?? null,
  );

  const startLabel = weeklyBuckets[0] ? formatDisplayDate(weeklyBuckets[0].weekStartIso, "short") : "—";
  const endLabel = weeklyBuckets.length
    ? formatDisplayDate(weeklyBuckets[weeklyBuckets.length - 1]!.weekEndIso, "short")
    : "—";

  const selectedWeekLabel = selectedBucket
    ? `${formatDisplayDate(selectedBucket.weekStartIso, "short")} - ${formatDisplayDate(
        selectedBucket.weekEndIso,
        "short",
      )}`
    : "—";

  const ariaLabel = selectedBucket
    ? `Weekly timeline chart for ${rangeLabel}. Selected week ${selectedWeekLabel}, closing balance ${formatAud(
        selectedBucket.closingBankBalance,
      )}.`
    : `Weekly timeline chart for ${rangeLabel}.`;

  return (
    <section className={cn("glass-clear rounded-[var(--radius-xl)] p-4 lg:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[color:var(--keel-ink-4)]">Selected week</p>
          <p className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{selectedWeekLabel}</p>
          <p className="mt-1 text-sm text-[color:var(--keel-ink-3)]">{rangeLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[color:var(--keel-ink-4)]">Closing balance (week end)</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#2f7fce]">
            {selectedBucket ? formatAud(selectedBucket.closingBankBalance) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-[color:var(--keel-ink-4)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[#2bbf9b]" /> Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[#d76d45]" /> Commitments
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-6 bg-[#2f7fce]" /> Closing balance
        </span>
      </div>

      <div ref={containerRef} className="mt-4 w-full">
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
          width="100%"
          height={SVG_HEIGHT}
          className="block"
        >
          <defs>
            <linearGradient id="weekly-balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(47,127,206,0.2)" />
              <stop offset="100%" stopColor="rgba(47,127,206,0.02)" />
            </linearGradient>
          </defs>

          <rect
            x={PAD_X}
            y={CHART_TOP}
            width={plotWidth}
            height={CHART_BOTTOM - CHART_TOP}
            rx={20}
            fill="color-mix(in oklab, var(--keel-ink), transparent 97%)"
          />

          <line
            x1={PAD_X}
            x2={width - PAD_X}
            y1={CASH_AXIS_Y}
            y2={CASH_AXIS_Y}
            stroke="color-mix(in oklab, var(--keel-ink), transparent 76%)"
            strokeWidth={1}
            strokeDasharray="5 7"
          />

          {linePoints.length >= 2 ? (
            <path
              d={`${balancePath} L ${width - PAD_X} ${CHART_BOTTOM} L ${PAD_X} ${CHART_BOTTOM} Z`}
              fill="url(#weekly-balance-fill)"
              stroke="none"
            />
          ) : null}

          {weeklyBuckets.map((bucket, index) => {
            const cx = PAD_X + bucketSlot * index + bucketSlot / 2;
            const incomeHeight = (bucket.income / maxCashflow) * BAR_RANGE;
            const commitmentHeight = (bucket.commitments / maxCashflow) * BAR_RANGE;
            const isSelected = selectedBucket?.weekStartIso === bucket.weekStartIso;
            return (
              <g key={bucket.weekStartIso}>
                {bucket.income > 0 ? (
                  <rect
                    x={cx - barWidth / 2}
                    y={CASH_AXIS_Y - incomeHeight}
                    width={barWidth}
                    height={incomeHeight}
                    rx={Math.max(2, barWidth / 2)}
                    fill="#2bbf9b"
                    opacity={isSelected ? 1 : 0.82}
                  />
                ) : null}
                {bucket.commitments > 0 ? (
                  <rect
                    x={cx - barWidth / 2}
                    y={CASH_AXIS_Y}
                    width={barWidth}
                    height={commitmentHeight}
                    rx={Math.max(2, barWidth / 2)}
                    fill="#d76d45"
                    opacity={isSelected ? 1 : 0.82}
                  />
                ) : null}
                <rect
                  x={cx - bucketSlot / 2}
                  y={CHART_TOP}
                  width={bucketSlot}
                  height={CHART_BOTTOM - CHART_TOP}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select week ending ${formatDisplayDate(bucket.weekEndIso, "short")}`}
                  onClick={() => onSelectWeek(bucket.weekStartIso)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onSelectWeek(bucket.weekStartIso);
                    }
                  }}
                />
              </g>
            );
          })}

          {linePoints.length >= 2 ? (
            <path
              d={balancePath}
              fill="none"
              stroke="#2f7fce"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {selectedBucket ? (
            <>
              <line
                x1={selectedX}
                x2={selectedX}
                y1={CHART_TOP + 4}
                y2={CHART_BOTTOM}
                stroke="color-mix(in oklab, var(--keel-ink), transparent 74%)"
                strokeWidth={1}
              />
              <circle cx={selectedX} cy={selectedY} r={6} fill="var(--color-card)" stroke="#2f7fce" strokeWidth={3} />
            </>
          ) : null}

          <text x={PAD_X} y={328} fill="var(--keel-ink-5)" style={{ fontSize: 10 }}>
            {startLabel}
          </text>
          <text
            x={width - PAD_X}
            y={328}
            textAnchor="end"
            fill="var(--keel-ink-5)"
            style={{ fontSize: 10 }}
          >
            {endLabel}
          </text>
        </svg>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Range income" value={windowIncome} tone="income" />
        <MetricCard label="Range commitments" value={windowCommitments} tone="commitment" />
        <MetricCard label="Range net" value={net} tone={net >= 0 ? "balance" : "commitment"} />
        <MetricCard
          label="Lowest closing balance"
          value={lowestBalance?.closingBankBalance ?? 0}
          tone={(lowestBalance?.closingBankBalance ?? 0) >= 0 ? "balance" : "commitment"}
          suffix={lowestBalance ? ` · ${formatDisplayDate(lowestBalance.weekEndIso, "short")}` : undefined}
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

