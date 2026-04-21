"use client";

/**
 * Tiny SVG sparkline for forecast cards (normalizes Y to viewBox height).
 *
 * @module components/keel/sparkline
 */

import { cn } from "@/lib/utils";

function normalize(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { min: 0, max: 1 };
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return { min, max: max === min ? min + 1 : max };
}

export function Sparkline({
  values,
  className,
  strokeClassName,
}: {
  values: number[];
  className?: string;
  strokeClassName?: string;
}) {
  if (!values.length) {
    return null;
  }

  const width = 120;
  const height = 28;
  const padding = 2;
  const { min, max } = normalize(values);

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(1, values.length - 1)) * (width - padding * 2);
      const y =
        padding +
        (1 - (value - min) / (max - min)) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-7 w-28", className)}
      role="img"
      aria-label="Sparkline"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={cn("text-emerald-500/80", strokeClassName)}
        points={points}
      />
    </svg>
  );
}

