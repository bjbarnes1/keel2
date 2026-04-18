"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createGoalSkip } from "@/app/actions/skips";
import { applyGoalSkipsToGoal } from "@/lib/engine/skips";
import type { EngineGoal } from "@/lib/engine/keel";
import type { GoalSkipInput, GoalSkipStrategy, PayFrequency } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

const strategies: Array<{
  id: GoalSkipStrategy;
  title: string;
  body: string;
}> = [
  {
    id: "EXTEND_DATE",
    title: "Extend timeline",
    body: "Treat this pay cycle as a pause — Keel eases the weekly pressure a little and pushes the simple completion hint out one pay.",
  },
  {
    id: "REBALANCE",
    title: "Rebalance",
    body: "Catch up gradually by slightly increasing the modeled per-pay contribution.",
  },
];

export function GoalSkipSheet({
  open,
  onClose,
  goalId,
  goalName,
  originalDateIso,
  baseGoal,
  existingGoalSkips,
  payFrequency,
}: {
  open: boolean;
  onClose: () => void;
  goalId: string;
  goalName: string;
  originalDateIso: string;
  baseGoal: EngineGoal;
  existingGoalSkips: GoalSkipInput[];
  payFrequency: PayFrequency;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<GoalSkipStrategy>("EXTEND_DATE");

  const hypothetical: GoalSkipInput = useMemo(
    () => ({ kind: "goal", goalId, originalDateIso, strategy }),
    [goalId, originalDateIso, strategy],
  );

  const adjustedCurrent = useMemo(
    () => applyGoalSkipsToGoal(baseGoal, existingGoalSkips, { payFrequency }),
    [baseGoal, existingGoalSkips, payFrequency],
  );

  const adjustedWithNew = useMemo(
    () => applyGoalSkipsToGoal(baseGoal, [...existingGoalSkips, hypothetical], { payFrequency }),
    [baseGoal, existingGoalSkips, hypothetical, payFrequency],
  );

  if (!open) {
    return null;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createGoalSkip({
          goalId,
          originalDateIso,
          strategy,
        });
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save skip.");
      }
    });
  }

  const perPayDelta = adjustedWithNew.contributionPerPay - adjustedCurrent.contributionPerPay;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="glass-heavy relative z-10 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-white/12 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="p-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Skip goal transfer</p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{goalName}</h2>
              <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">{originalDateIso}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2 py-1 text-sm text-[color:var(--keel-ink-3)] hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {strategies.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setStrategy(card.id)}
                className={cn(
                  "w-full rounded-[var(--radius-md)] border px-3 py-3 text-left text-sm transition-colors",
                  strategy === card.id
                    ? "glass-tint-safe border-white/18"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20",
                )}
              >
                <p className="font-medium text-[color:var(--keel-ink)]">{card.title}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--keel-ink-3)]">{card.body}</p>
              </button>
            ))}
          </div>

          <div
            key={`${strategy}-${adjustedWithNew.contributionPerPay}`}
            className="glass-clear mt-4 rounded-[var(--radius-md)] border border-white/10 p-4 transition-opacity duration-200"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">
              Modeled per-pay contribution
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(adjustedWithNew.contributionPerPay)}
            </p>
            <p className="mt-2 text-xs text-[color:var(--keel-ink-3)]">
              {perPayDelta === 0
                ? "No change to per-pay pressure under this strategy with your current skips."
                : perPayDelta > 0
                  ? `Adds about ${formatAud(perPayDelta)} per pay versus today’s adjusted baseline.`
                  : `Eases about ${formatAud(-perPayDelta)} per pay versus today’s adjusted baseline.`}
            </p>
            {adjustedWithNew.projectedCompletionIso ? (
              <p className="mt-2 text-xs text-[color:var(--keel-ink-3)]">
                Simple completion hint:{" "}
                <span className="font-mono text-[color:var(--keel-ink)]">{adjustedWithNew.projectedCompletionIso}</span>
              </p>
            ) : null}
          </div>

          {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className={cn(
                "flex-1 rounded-[var(--radius-md)] py-3 text-sm font-semibold text-[color:var(--keel-ink)] transition-opacity disabled:opacity-40",
                "glass-tint-safe border border-white/12",
              )}
            >
              {pending ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
