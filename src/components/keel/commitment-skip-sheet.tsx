"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createCommitmentSkip } from "@/app/actions/skips";
import { previewSkipImpact, type ScheduledCashflowEvent } from "@/lib/engine/skips";
import type { CommitmentSkipInput, CommitmentSkipStrategy } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

import { GlassSheet } from "@/components/keel/glass-sheet";

type GoalOption = { id: string; name: string };

const strategies: Array<{
  id: CommitmentSkipStrategy;
  title: string;
  body: string;
}> = [
  {
    id: "MAKE_UP_NEXT",
    title: "Make up next",
    body: "Skip this payment and add the same amount to your next due date.",
  },
  {
    id: "SPREAD",
    title: "Spread",
    body: "Split this payment across the next few occurrences so each bump stays smaller.",
  },
  {
    id: "MOVE_ON",
    title: "Move to a goal",
    body: "Skip this payment and park the amount in a goal’s balance instead.",
  },
];

export function CommitmentSkipSheet({
  open,
  onClose,
  commitmentId,
  commitmentName,
  amount,
  originalDateIso,
  goals,
  baselineOrdered,
  startingAvailableMoney,
  existingCommitmentSkips,
}: {
  open: boolean;
  onClose: () => void;
  commitmentId: string;
  commitmentName: string;
  amount: number;
  originalDateIso: string;
  goals: GoalOption[];
  baselineOrdered: ScheduledCashflowEvent[];
  startingAvailableMoney: number;
  existingCommitmentSkips: CommitmentSkipInput[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<CommitmentSkipStrategy>("MAKE_UP_NEXT");
  const [spreadOverN, setSpreadOverN] = useState(2);
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");

  const hypotheticalSkip = useMemo<CommitmentSkipInput>(
    () => ({
      kind: "commitment",
      commitmentId,
      originalDateIso,
      strategy,
      spreadOverN: strategy === "SPREAD" ? spreadOverN : undefined,
      redirectTo: strategy === "MOVE_ON" && goalId ? `goal:${goalId}` : undefined,
    }),
    [commitmentId, goalId, originalDateIso, spreadOverN, strategy],
  );

  const preview = useMemo(() => {
    try {
      return previewSkipImpact({
        baselineOrdered,
        startingAvailableMoney,
        skip: hypotheticalSkip,
        existingCommitmentSkips,
      });
    } catch {
      return null;
    }
  }, [baselineOrdered, existingCommitmentSkips, hypotheticalSkip, startingAvailableMoney]);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createCommitmentSkip({
          commitmentId,
          originalDateIso,
          strategy,
          spreadOverN: strategy === "SPREAD" ? spreadOverN : undefined,
          redirectTo: strategy === "MOVE_ON" ? `goal:${goalId}` : undefined,
        });
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save skip.");
      }
    });
  }

  const previewCopy =
    strategy === "MAKE_UP_NEXT"
      ? "The next due date absorbs this payment. End-of-window available money shifts by the amount below."
      : strategy === "SPREAD"
        ? `Split across the next ${spreadOverN} due dates (when they exist). Delta reflects combined timing.`
        : goalId
          ? "This row drops out of the schedule; the amount is redirected in bookkeeping to your goal."
          : "Pick a goal to preview redirect impact.";

  const sheetOpen = open && Boolean(commitmentId) && Boolean(originalDateIso);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={onClose}
      title="Skip payment"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || (strategy === "MOVE_ON" && (!goalId || goals.length === 0))}
            onClick={submit}
            className={cn(
              "flex-1 rounded-[var(--radius-md)] py-3 text-sm font-semibold text-[color:var(--keel-ink)] transition-opacity disabled:opacity-40",
              "glass-tint-safe border border-white/12",
            )}
          >
            {pending ? "Saving…" : "Confirm skip"}
          </button>
        </div>
      }
    >
      <div>
        <p className="text-lg font-semibold text-[color:var(--keel-ink)]">{commitmentName}</p>
        <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">{originalDateIso}</p>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Amount</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--keel-ink)]">
          {formatAud(amount)}
        </p>
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

      {strategy === "SPREAD" ? (
        <label className="mt-4 block text-sm text-[color:var(--keel-ink-2)]">
          Spread over next{" "}
          <input
            type="number"
            min={1}
            max={12}
            value={spreadOverN}
            onChange={(event) => setSpreadOverN(Number(event.target.value) || 2)}
            className="mx-1 w-14 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-center font-mono text-[color:var(--keel-ink)]"
          />{" "}
          due dates
        </label>
      ) : null}

      {strategy === "MOVE_ON" ? (
        <label className="mt-4 block space-y-2 text-sm text-[color:var(--keel-ink-2)]">
          <span>Goal to receive this payment</span>
          <select
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-white/15 bg-black/20 px-3 py-3 text-[color:var(--keel-ink)]"
          >
            {goals.length === 0 ? (
              <option value="">Add a goal first</option>
            ) : (
              goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}

      {preview ? (
        <div
          key={`${strategy}-${spreadOverN}-${goalId}-${preview.endAvailableMoneyDelta}`}
          className="glass-clear mt-4 rounded-[var(--radius-md)] border border-white/10 p-4 transition-opacity duration-200"
        >
          <p className="text-xs leading-5 text-[color:var(--keel-ink-3)]">{previewCopy}</p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">
            42-day horizon · end available delta
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-xl font-semibold tabular-nums",
              preview.endAvailableMoneyDelta >= 0 ? "text-[color:var(--keel-ink)]" : "text-[color:var(--keel-attend)]",
            )}
          >
            {preview.endAvailableMoneyDelta >= 0 ? "+" : ""}
            {formatAud(preview.endAvailableMoneyDelta)}
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}
    </GlassSheet>
  );
}
