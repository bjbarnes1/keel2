"use client";

/**
 * Lightweight client button that triggers the Layer B analyser for the signed-in user.
 *
 * Uses `useTransition` so the button disables immediately and React doesn't block the
 * rest of the page on the server action. Surfaces the result inline without a full
 * page navigation — `revalidatePath` in the action will refresh the server-rendered
 * patterns cards on the next paint.
 *
 * @module components/keel/patterns-refresh-button
 */

import { useState, useTransition } from "react";

import { recomputePatternsAction } from "@/app/actions/patterns";

export function PatternsRefreshButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onClick = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await recomputePatternsAction();
      if (result.ok) {
        const n = result.totalTransactionsAnalyzed ?? 0;
        setMessage({
          kind: "ok",
          text: `Analysed ${n.toLocaleString("en-AU")} transactions.`,
        });
      } else {
        setMessage({ kind: "err", text: result.error ?? "Something went wrong." });
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="glass-tint-safe rounded-[var(--radius-pill)] border border-[color:var(--keel-safe-soft)]/25 px-4 py-2 text-[13px] font-medium text-[color:var(--keel-safe-soft)] transition-opacity disabled:opacity-60"
      >
        {pending ? "Analysing…" : "Refresh patterns"}
      </button>
      {message ? (
        <p
          className={
            message.kind === "ok"
              ? "text-[11px] text-[color:var(--keel-safe-soft)]"
              : "text-[11px] text-[color:var(--keel-attend)]"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
