"use client";

import Link from "next/link";

import type { GoalView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

function sparkValues(goal: GoalView, hasTarget: boolean) {
  const n = 10;
  const bal = Math.max(0, goal.currentBalance);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    if (hasTarget && goal.targetAmount) {
      return bal * t;
    }
    return bal * t * 0.85 + bal * 0.15 * Math.sin(t * Math.PI);
  }).map((v) => Math.max(0, v));
}

function normalize(values: number[]) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return { min, max: max === min ? min + 1 : max };
}

function Spark({
  goalId,
  values,
  hasTarget,
  targetAmount,
  currentBalance,
}: {
  goalId: string;
  values: number[];
  hasTarget: boolean;
  targetAmount: number | null;
  currentBalance: number;
}) {
  const width = 120;
  const height = 24;
  const paddingX = 2;
  const paddingY = 3;
  const { min, max } = normalize(values);

  const points = values.map((value, index) => {
    const x = paddingX + (index / Math.max(1, values.length - 1)) * (width - paddingX * 2);
    const y = paddingY + (1 - (value - min) / (max - min)) * (height - paddingY * 2 - (hasTarget ? 4 : 0));
    return { x, y };
  });

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const fillD = `${d} L ${points[points.length - 1]!.x.toFixed(2)} ${(height - 2).toFixed(
    2,
  )} L ${points[0]!.x.toFixed(2)} ${(height - 2).toFixed(2)} Z`;

  const gradientId = `goal-spark-${goalId}`;
  const percent = hasTarget && targetAmount ? Math.min(currentBalance / targetAmount, 1) : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-[120px]" role="img" aria-label="Goal sparkline">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(142, 196, 168, 0.15)" />
          <stop offset="1" stopColor="rgba(142, 196, 168, 0)" />
        </linearGradient>
      </defs>

      <path d={fillD} fill={`url(#${gradientId})`} />
      <path d={d} fill="none" stroke="rgba(142, 196, 168, 0.6)" strokeWidth="1" />

      {hasTarget && targetAmount ? (
        <>
          <rect x="2" y={height - 3} width={width - 4} height="2" rx="1" fill="rgba(255,255,255,0.08)" />
          <rect
            x="2"
            y={height - 3}
            width={Math.max(0, (width - 4) * percent)}
            height="2"
            rx="1"
            fill="rgba(142, 196, 168, 0.6)"
          />
        </>
      ) : null}
    </svg>
  );
}

export function GoalRow({ goal }: { goal: GoalView }) {
  const hasTarget = goal.targetAmount != null;
  const values = sparkValues(goal, hasTarget);

  const progressCopy = hasTarget
    ? `${formatAud(goal.currentBalance)} / ${formatAud(goal.targetAmount ?? 0)}`
    : `${formatAud(goal.currentBalance)} / open-ended`;

  return (
    <Link
      href={`/goals/${goal.id}`}
      className={cn(
        "grid grid-cols-[1fr_auto_auto_120px] items-center gap-4 px-3 py-3",
        "border-b border-white/[0.04] no-underline text-inherit transition-opacity hover:opacity-90",
      )}
    >
      <p className="truncate text-[14px] font-medium text-[color:var(--keel-ink)]">{goal.name}</p>

      <p className="truncate font-mono text-[12px] tabular-nums text-[color:var(--keel-ink-3)]">{progressCopy}</p>

      <p className="truncate font-mono text-[12px] tabular-nums text-[color:var(--keel-safe-soft)]">
        {formatAud(goal.contributionPerPay)}
        <span className="ml-1 font-sans text-[11px] text-[color:var(--keel-safe-soft)]">/pay</span>
      </p>

      <div className="justify-self-end">
        <Spark
          goalId={goal.id}
          values={values}
          hasTarget={hasTarget}
          targetAmount={goal.targetAmount ?? null}
          currentBalance={goal.currentBalance}
        />
      </div>
    </Link>
  );
}

