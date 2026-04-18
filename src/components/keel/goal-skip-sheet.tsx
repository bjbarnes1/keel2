"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createGoalSkip } from "@/app/actions/skips";
import type { GoalSkipStrategy } from "@/lib/types";
import { cn } from "@/lib/utils";

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
}: {
  open: boolean;
  onClose: () => void;
  goalId: string;
  goalName: string;
  originalDateIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<GoalSkipStrategy>("EXTEND_DATE");

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] border border-white/10 bg-[color:var(--keel-tide-2)] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Skip goal transfer</p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{goalName}</h2>
            <p className="mt-1 text-sm text-[color:var(--keel-ink-2)]">{originalDateIso}</p>
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
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20",
              )}
            >
              <p className="font-medium text-[color:var(--keel-ink)]">{card.title}</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--keel-ink-3)]">{card.body}</p>
            </button>
          ))}
        </div>

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
            disabled={pending}
            onClick={submit}
            className="flex-1 rounded-[var(--radius-md)] bg-emerald-700 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
