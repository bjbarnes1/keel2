"use client";

/**
 * Goal summary card for home + goals list: open-ended vs targeted layouts, subtle progress sparkline.
 *
 * @module components/keel/goal-card
 */

import Link from "next/link";

import type { GoalView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

import { Sparkline } from "@/components/keel/sparkline";

function savingsSparkline(goal: GoalView, hasTarget: boolean) {
  const n = 8;
  const bal = Math.max(0, goal.currentBalance);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    if (hasTarget && goal.targetAmount) {
      return bal * t;
    }
    return bal * t * 0.85 + bal * 0.15 * Math.sin(t * Math.PI);
  }).map((v) => Math.max(0, v));
}

export function GoalCard({ goal }: { goal: GoalView }) {
  const hasTarget = Boolean(goal.targetAmount);
  const percent = goal.targetAmount
    ? Math.min(Math.round((goal.currentBalance / goal.targetAmount) * 100), 100)
    : 0;
  const sparkValues = savingsSparkline(goal, hasTarget);

  return (
    <Link href={`/goals/${goal.id}`} className="block">
      <section
        className={cn(
          "glass-clear rounded-[var(--radius-md)] p-4 transition-colors hover:border-primary/40",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{goal.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasTarget ? "Savings goal" : "Building steadily — no target yet"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              {formatAud(goal.contributionPerPay)}
              <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">/pay</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            {hasTarget ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {formatAud(goal.currentBalance)} of {formatAud(goal.targetAmount ?? 0)}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{percent}% funded</span>
                  {goal.targetDate ? <span>Target {goal.targetDate}</span> : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                  {formatAud(goal.currentBalance)}
                </span>{" "}
                set aside so far
              </p>
            )}
          </div>
          <div className="shrink-0 opacity-80">
            <Sparkline
              values={sparkValues}
              className="opacity-90"
              strokeClassName="stroke-[color:var(--keel-safe-soft)]"
            />
          </div>
        </div>
      </section>
    </Link>
  );
}
