"use client";

import { useId, useMemo } from "react";

import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentFrequency, PayFrequency } from "@/lib/types";
import { formatAud } from "@/lib/utils";

type WaterlineIncome = {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDateIso: string;
  isPrimary: boolean;
};

type WaterlineCommitment = {
  id: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDateIso: string;
  isAttention?: boolean;
};

const FILLER_TOKENS = new Set(["income", "protection", "insurance", "pay", "salary", "payment"]);

function shortenIncomeName(name: string): string {
  const words = name.trim().split(/\s+/);
  const meaningful = words.find((word) => !FILLER_TOKENS.has(word.toLowerCase()));
  return meaningful ?? words[0] ?? name;
}

function skipOccurrenceKey(commitmentId: string, iso: string) {
  return `${commitmentId}:${iso}`;
}

function parseIsoDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function addCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const next = new Date(date);
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    default:
      return next;
  }
}

function subtractCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const prev = new Date(date);
  switch (frequency) {
    case "weekly":
      prev.setUTCDate(prev.getUTCDate() - 7);
      return prev;
    case "fortnightly":
      prev.setUTCDate(prev.getUTCDate() - 14);
      return prev;
    case "monthly":
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      return prev;
    case "quarterly":
      prev.setUTCMonth(prev.getUTCMonth() - 3);
      return prev;
    case "annual":
      prev.setUTCFullYear(prev.getUTCFullYear() - 1);
      return prev;
    default:
      return prev;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function horizonDateLabel(date: Date) {
  return date
    .toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}

export function WaterlineTimeline({
  asOfIso,
  windowStartIso,
  incomes,
  commitments,
  skippedOccurrenceKeys,
}: {
  asOfIso: string;
  windowStartIso: string;
  incomes: WaterlineIncome[];
  commitments: WaterlineCommitment[];
  /** `commitmentId:yyyy-mm-dd` for hollow skipped anchors */
  skippedOccurrenceKeys?: ReadonlySet<string>;
}) {
  const width = 360;
  const height = 180;
  const baselineY = 90;
  const padX = 8;
  const chartWidth = width - 2 * padX;

  const rawId = useId().replace(/:/g, "");
  const tideFillId = `tideFill-${rawId}`;
  const tideFadeRightId = `tideFadeRight-${rawId}`;
  const tideMaskId = `tideMask-${rawId}`;
  const todayHaloId = `todayHalo-${rawId}`;

  const xGuide1 = width / 3;
  const xGuide2 = (2 * width) / 3;

  const model = useMemo(() => {
    const asOf = parseIsoDate(asOfIso);
    const windowStart = parseIsoDate(windowStartIso);
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 42);

    const windowMs = windowEnd.getTime() - windowStart.getTime();
    const xForDate = (date: Date) => {
      const t = (date.getTime() - windowStart.getTime()) / windowMs;
      return clamp(t, 0, 1);
    };

    const payMarkers = incomes.flatMap((income) => {
      const markers: Array<{
        x: number;
        label: string;
        fullLabel: string;
        amount: number;
        dateLabel: string;
        dotOpacity: number;
        textOpacity: number;
        nameFill: string;
        amountFill: string;
      }> = [];
      let cursor = parseIsoDate(income.nextPayDateIso);

      while (cursor < windowStart) {
        cursor = addCycle(cursor, income.frequency);
      }
      while (true) {
        const prev = subtractCycle(cursor, income.frequency);
        if (prev < windowStart) {
          break;
        }
        cursor = prev;
      }

      while (cursor < windowEnd) {
        if (cursor >= windowStart) {
          const localIndex = markers.length;
          let dotOpacity = 1;
          let textOpacity = 1;
          let nameFill = "#d4cfbf";
          let amountFill = "#a8ac9f";
          if (localIndex === 1) {
            dotOpacity = 0.5;
            textOpacity = 0.7;
            nameFill = "#a8ac9f";
            amountFill = "#8a8f88";
          } else if (localIndex >= 2) {
            dotOpacity = 0.35;
            textOpacity = 0.5;
            nameFill = "#a8ac9f";
            amountFill = "#8a8f88";
          }

          markers.push({
            x: xForDate(cursor),
            label: shortenIncomeName(income.name),
            fullLabel: income.name,
            amount: income.amount,
            dateLabel: cursor
              .toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
              .toUpperCase(),
            dotOpacity,
            textOpacity,
            nameFill,
            amountFill,
          });
        }
        cursor = addCycle(cursor, income.frequency);
      }

      return markers;
    });

    const annualized = commitments.map((commitment) => annualizeAmount(commitment.amount, commitment.frequency));
    const maxAnnual = Math.max(1, ...annualized);

    const anchors = commitments.flatMap((commitment) => {
      const weight = clamp(annualizeAmount(commitment.amount, commitment.frequency) / maxAnnual, 0, 1);
      const points: Array<{
        x: number;
        weight: number;
        attention: boolean;
        skipped: boolean;
        label: string;
        amount: number;
      }> = [];

      let due = parseIsoDate(commitment.nextDueDateIso);
      while (due < windowStart) {
        due = addCycle(due, commitment.frequency);
      }

      while (due < windowEnd) {
        if (due >= windowStart) {
          const iso = due.toISOString().slice(0, 10);
          const skipped = skippedOccurrenceKeys?.has(skipOccurrenceKey(commitment.id, iso)) ?? false;
          points.push({
            x: xForDate(due),
            weight,
            attention: Boolean(commitment.isAttention),
            skipped,
            label: commitment.name,
            amount: commitment.amount,
          });
        }
        due = addCycle(due, commitment.frequency);
      }

      return points;
    });

    const todayX = xForDate(asOf);
    const elapsedX1 = 0;
    const elapsedX2 = clamp(todayX, 0, 1);

    const windowEndInclusive = new Date(windowEnd);
    windowEndInclusive.setUTCDate(windowEndInclusive.getUTCDate() - 1);
    const windowMid = new Date(windowStart);
    windowMid.setUTCDate(windowMid.getUTCDate() + 21);

    const horizonLabels = {
      start: horizonDateLabel(windowStart),
      mid: horizonDateLabel(windowMid),
      end: horizonDateLabel(windowEndInclusive),
    };

    return { payMarkers, anchors, elapsedX1, elapsedX2, todayX, horizonLabels };
  }, [asOfIso, commitments, incomes, skippedOccurrenceKeys, windowStartIso]);

  const elapsedMaskX = padX + model.elapsedX1 * chartWidth;
  const elapsedMaskW = Math.max(0, (model.elapsedX2 - model.elapsedX1) * chartWidth);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Six week waterline timeline"
      className="block"
    >
      <defs>
        <linearGradient id={tideFillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(107, 179, 145, 0.14)" />
          <stop offset="100%" stopColor="rgba(107, 179, 145, 0.02)" />
        </linearGradient>
        <linearGradient id={tideFadeRightId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(107, 179, 145, 1)" />
          <stop offset="80%" stopColor="rgba(107, 179, 145, 0.6)" />
          <stop offset="100%" stopColor="rgba(107, 179, 145, 0)" />
        </linearGradient>
        <mask id={tideMaskId}>
          <rect x="0" y="0" width={width} height={height} fill="black" />
          <rect
            x={elapsedMaskX}
            y={baselineY}
            width={elapsedMaskW}
            height={42}
            fill={`url(#${tideFadeRightId})`}
          />
        </mask>
        <filter id={todayHaloId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={0} y={baselineY} width={width} height={42} fill={`url(#${tideFillId})`} mask={`url(#${tideMaskId})`} />

      <line
        x1={xGuide1}
        y1={20}
        x2={xGuide1}
        y2={156}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={0.5}
        strokeDasharray="2 4"
      />
      <line
        x1={xGuide2}
        y1={20}
        x2={xGuide2}
        y2={156}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={0.5}
        strokeDasharray="2 4"
      />

      <line
        x1={padX}
        y1={baselineY}
        x2={width - padX}
        y2={baselineY}
        stroke="rgba(240, 235, 220, 0.3)"
        strokeWidth={0.75}
      />

      {model.payMarkers.map((marker, idx) => (
        <g
          key={`${marker.fullLabel}-${marker.dateLabel}-${idx}`}
          transform={`translate(${marker.x * width}, ${baselineY})`}
          aria-label={`${marker.fullLabel}, ${marker.dateLabel}, ${formatAud(marker.amount)}`}
        >
          <title>{marker.fullLabel}</title>
          <circle cx={0} cy={0} r={4} fill="#f0ebdc" opacity={marker.dotOpacity} />
          <text
            x={0}
            y={-12}
            textAnchor="middle"
            fill={marker.nameFill}
            opacity={marker.textOpacity}
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            {marker.label}
          </text>
          <text
            x={0}
            y={-24}
            textAnchor="middle"
            fill={marker.amountFill}
            opacity={marker.textOpacity}
            style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}
          >
            +{formatAud(marker.amount)}
          </text>
          <text
            x={0}
            y={-36}
            textAnchor="middle"
            fill="#5f645e"
            opacity={marker.textOpacity}
            style={{ fontSize: 8, letterSpacing: "0.5px" }}
          >
            {marker.dateLabel}
          </text>
        </g>
      ))}

      {model.anchors.map((anchor, idx) => {
        const stemLength = 18 + anchor.weight * 28;
        const dotRadius = 3 + anchor.weight * 2.5;
        const stemAlpha = 0.22 + anchor.weight * 0.08;
        const cy = stemLength + dotRadius;

        const fill = anchor.skipped
          ? "transparent"
          : anchor.attention
            ? "rgba(212, 165, 92, 0.95)"
            : "rgba(240, 235, 220, 0.88)";
        const stroke = anchor.skipped
          ? "rgba(212, 165, 92, 0.6)"
          : anchor.attention
            ? "rgba(212, 165, 92, 0.55)"
            : "rgba(255, 255, 255, 0.18)";
        const strokeW = anchor.skipped ? 1.35 : 0.75;

        return (
          <g key={`anchor-${idx}-${anchor.label}-${anchor.x}`} transform={`translate(${anchor.x * width}, ${baselineY})`}>
            <line x1={0} y1={0} x2={0} y2={stemLength} stroke={`rgba(240, 235, 220, ${stemAlpha})`} strokeWidth={1} />
            <circle cx={0} cy={cy} r={dotRadius} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            {anchor.label ? (
              <text x={0} y={cy + dotRadius + 10} textAnchor="middle" fill="#a8ac9f" style={{ fontSize: 9, fontWeight: 500 }}>
                {anchor.label}
              </text>
            ) : null}
            <text
              x={0}
              y={cy + dotRadius + 22}
              textAnchor="middle"
              fill="#5f645e"
              style={{ fontSize: 8, fontVariantNumeric: "tabular-nums" }}
            >
              {formatAud(anchor.amount)}
            </text>
          </g>
        );
      })}

      <g transform={`translate(${model.todayX * width}, ${baselineY})`} filter={`url(#${todayHaloId})`}>
        <circle cx={0} cy={0} r={7} fill="rgba(240, 235, 220, 0.95)" stroke="rgba(255, 255, 255, 0.4)" strokeWidth={0.75} />
      </g>

      <text x={padX} y={170} fill="#5f645e" style={{ fontSize: 8, letterSpacing: "1px", fontWeight: 500 }}>
        {model.horizonLabels.start}
      </text>
      <text x={width / 2} y={170} textAnchor="middle" fill="#5f645e" style={{ fontSize: 8, letterSpacing: "1px", fontWeight: 500 }}>
        {model.horizonLabels.mid}
      </text>
      <text
        x={width - padX}
        y={170}
        textAnchor="end"
        fill="#5f645e"
        style={{ fontSize: 8, letterSpacing: "1px", fontWeight: 500 }}
      >
        {model.horizonLabels.end}
      </text>
    </svg>
  );
}
