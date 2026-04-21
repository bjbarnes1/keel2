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
};

export function CommitmentArchiveSheet({ open, onClose, commitmentId, commitmentName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!commitmentId) return;
    setError(null);
    startTransition(async () => {
      try {
        await archiveCommitmentAction(commitmentId);
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
      title="Archive commitment"
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
      <p className="text-sm leading-6 text-[color:var(--keel-ink-2)]">
        <span className="font-medium text-[color:var(--keel-ink)]">{commitmentName}</span> will be
        archived and removed from active commitments and your pay-period reserve math. You can restore it later
        from data tools if needed.
      </p>
      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}
    </GlassSheet>
  );
}
