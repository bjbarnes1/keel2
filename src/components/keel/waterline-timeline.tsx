"use client";

import { useMemo } from "react";

import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentFrequency, PayFrequency } from "@/lib/types";

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

export function WaterlineTimeline({
  asOfIso,
  windowStartIso,
  incomes,
  commitments,
}: {
  asOfIso: string;
  windowStartIso: string;
  incomes: WaterlineIncome[];
  commitments: WaterlineCommitment[];
}) {
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
      const markers: Array<{ x: number; label: string; opacity: number }> = [];
      let cursor = parseIsoDate(income.nextPayDateIso);

      // Walk backwards to the first occurrence on/after windowStart.
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
          markers.push({
            x: xForDate(cursor),
            label: income.name,
            opacity: income.isPrimary ? 1 : 0.45,
          });
        }
        cursor = addCycle(cursor, income.frequency);
      }

      return markers;
    });

    const annualized = commitments.map((commitment) => annualizeAmount(commitment.amount, commitment.frequency));
    const maxAnnual = Math.max(1, ...annualized);

    const anchors = commitments.flatMap((commitment) => {
      const depth = 18 + (annualizeAmount(commitment.amount, commitment.frequency) / maxAnnual) * 52;
      const points: Array<{ x: number; depth: number; attention: boolean }> = [];

      let due = parseIsoDate(commitment.nextDueDateIso);
      while (due < windowStart) {
        due = addCycle(due, commitment.frequency);
      }

      while (due < windowEnd) {
        if (due >= windowStart) {
          points.push({
            x: xForDate(due),
            depth,
            attention: Boolean(commitment.isAttention),
          });
        }
        due = addCycle(due, commitment.frequency);
      }

      return points;
    });

    const fortnightTicks = [0, 14, 28, 42].map((day) => {
      const d = new Date(windowStart);
      d.setUTCDate(d.getUTCDate() + day);
      return xForDate(d);
    });

    const todayX = xForDate(asOf);
    const elapsedX1 = 0;
    const elapsedX2 = clamp(todayX, 0, 1);

    return { payMarkers, anchors, fortnightTicks, elapsedX1, elapsedX2, todayX };
  }, [asOfIso, commitments, incomes, windowStartIso]);

  const width = 360;
  const height = 150;
  const baselineY = 78;

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
        <linearGradient id="waterElapsed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(107, 179, 145, 0.22)" />
          <stop offset="100%" stopColor="rgba(107, 179, 145, 0.06)" />
        </linearGradient>
        <filter id="todayHalo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x={model.elapsedX1 * width}
        y={24}
        width={Math.max(0, (model.elapsedX2 - model.elapsedX1) * width)}
        height={baselineY - 24}
        fill="url(#waterElapsed)"
      />

      {model.fortnightTicks.map((x) => (
        <line
          key={x}
          x1={x * width}
          y1={22}
          x2={x * width}
          y2={baselineY + 46}
          stroke="rgba(168, 172, 159, 0.22)"
          strokeWidth={1}
          strokeDasharray="3 6"
        />
      ))}

      <line x1={0} y1={baselineY} x2={width} y2={baselineY} stroke="rgba(240, 235, 220, 0.35)" strokeWidth={1} />

      {model.payMarkers.map((marker, idx) => (
        <g key={`${marker.label}-${idx}`} transform={`translate(${marker.x * width}, ${baselineY - 18})`}>
          <circle cx={0} cy={0} r={3.5} fill="rgba(240, 235, 220, 0.95)" opacity={marker.opacity} />
          <text
            x={0}
            y={-10}
            textAnchor="middle"
            fill="rgba(240, 235, 220, 0.92)"
            opacity={marker.opacity}
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            {marker.label}
          </text>
        </g>
      ))}

      {model.anchors.map((anchor, idx) => (
        <g key={`anchor-${idx}`} transform={`translate(${anchor.x * width}, ${baselineY})`}>
          <circle
            cx={0}
            cy={anchor.depth}
            r={4.25}
            fill={anchor.attention ? "rgba(212, 165, 92, 0.95)" : "rgba(240, 235, 220, 0.9)"}
            stroke={anchor.attention ? "rgba(212, 165, 92, 0.55)" : "rgba(255, 255, 255, 0.18)"}
            strokeWidth={0.75}
          />
        </g>
      ))}

      <g transform={`translate(${model.todayX * width}, ${baselineY})`} filter="url(#todayHalo)">
        <circle cx={0} cy={0} r={6.5} fill="rgba(240, 235, 220, 0.92)" stroke="rgba(255, 255, 255, 0.35)" strokeWidth={0.75} />
      </g>
    </svg>
  );
}
