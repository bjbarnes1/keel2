"use client";

/**
 * Archive commitment confirmation (`archiveCommitmentAction`).
 *
 * @module components/keel/commitment-archive-sheet
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveCommitmentAction } from "@/app/actions/keel";
import { cn } from "@/lib/utils";

import { GlassSheet } from "@/components/keel/glass-sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  commitmentId: string;
  commitmentName: string;
  /** Optional: amount currently held toward the next due date (for copy). */
  heldFormatted?: string;
  /** Called with the archived id immediately before navigation/refresh. */
  onArchived?: (id: string) => void;
};

export function CommitmentArchiveSheet({
  open,
  onClose,
  commitmentId,
  commitmentName,
  heldFormatted,
  onArchived,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!commitmentId) return;
    setError(null);
    startTransition(async () => {
      try {
        await archiveCommitmentAction(commitmentId);
        onArchived?.(commitmentId);
        onClose();
        router.push("/commitments");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not archive.");
      }
    });
  }

  return (
    <GlassSheet
      open={open && Boolean(commitmentId)}
      onClose={onClose}
      title={`Archive ${commitmentName}?`}
      size="medium"
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
            disabled={pending}
            onClick={confirm}
            className={cn(
              "flex-1 rounded-[var(--radius-md)] border border-white/12 py-3 text-sm font-semibold text-[color:var(--keel-ink)] transition-opacity disabled:opacity-40",
              "glass-tint-attend",
            )}
          >
            {pending ? "Archiving…" : "Archive"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-6 text-[color:var(--keel-ink-2)]">
        <p>
          Archived commitments stop appearing in your timeline and in pay-period reserve math.
        </p>
        <p>
          {heldFormatted ? (
            <>
              Any amount held toward the next due date ({heldFormatted}) stops being reserved and
              goes back toward your available money.
            </>
          ) : (
            <>
              Any amount Keel was reserving toward the next due date stops being held; those funds
              go back toward your available money.
            </>
          )}
        </p>
        <p>You can restore this commitment anytime from the Archived section on the list.</p>
      </div>
      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}
    </GlassSheet>
  );
}
