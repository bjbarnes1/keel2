"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCommitmentSkip } from "@/app/actions/skips";
import type { CommitmentSkipStrategy } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

type GoalOption = { id: string; name: string };

const strategies: Array<{
  id: CommitmentSkipStrategy;
  title: string;
  body: string;
}> = [
  {
    id: "MAKE_UP_NEXT",
    title: "Make up next",
    body: "Skip this payment and add the same amount to your next bill date.",
  },
  {
    id: "SPREAD",
    title: "Spread",
    body: "Split this payment across the next few occurrences so each bump stays smaller.",
  },
  {
    id: "MOVE_ON",
    title: "Move to a goal",
    body: "Skip this bill and park the amount in a goal’s balance instead.",
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
}: {
  open: boolean;
  onClose: () => void;
  commitmentId: string;
  commitmentName: string;
  amount: number;
  originalDateIso: string;
  goals: GoalOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<CommitmentSkipStrategy>("MAKE_UP_NEXT");
  const [spreadOverN, setSpreadOverN] = useState(2);
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");

  if (!open) {
    return null;
  }

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] border border-white/10 bg-[color:var(--keel-tide-2)] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Skip payment</p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{commitmentName}</h2>
            <p className="mt-1 text-sm text-[color:var(--keel-ink-2)]">
              {originalDateIso} · {formatAud(amount)}
            </p>
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
                  ? "border-amber-500/50 bg-amber-500/10"
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
            bills
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

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

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
            disabled={pending || (strategy === "MOVE_ON" && (!goalId || goals.length === 0))}
            onClick={submit}
            className="flex-1 rounded-[var(--radius-md)] bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Confirm skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
