"use client";

/**
 * Revoke an active commitment skip (`revokeCommitmentSkip`).
 *
 * @module components/keel/commitment-restore-sheet
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revokeCommitmentSkip } from "@/app/actions/skips";
import { cn } from "@/lib/utils";

export function CommitmentRestoreSheet({
  open,
  onClose,
  skipId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  skipId: string | null;
  /** Bill name or short context */
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open || !skipId) {
    return null;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await revokeCommitmentSkip({ skipId });
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not restore payment.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="glass-heavy relative z-10 w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-white/12 p-0 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="p-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Restore payment</p>
              {label ? (
                <h2 className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{label}</h2>
              ) : (
                <h2 className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">Bill skip</h2>
              )}
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
                Put this occurrence back on your schedule. Forecasts update right away.
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

          {error ? (
            <p className="mt-4 text-sm text-[color:var(--keel-attend)]">{error}</p>
          ) : null}

          <div className="mt-6 flex gap-2">
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
              {pending ? "Restoring…" : "Restore"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
