"use client";

/**
 * Archive income confirmation (`archiveIncomeAction`) — amber attend tint, no destructive red.
 *
 * @module components/keel/income-archive-sheet
 */

import { useState, useTransition } from "react";

import { archiveIncomeAction } from "@/app/actions/keel";
import { cn } from "@/lib/utils";

import { GlassSheet } from "@/components/keel/glass-sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  incomeId: string;
  incomeName: string;
};

export function IncomeArchiveSheet({ open, onClose, incomeId, incomeName }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!incomeId) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("incomeId", incomeId);
        await archiveIncomeAction(fd);
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not archive.");
      }
    });
  }

  return (
    <GlassSheet
      open={open && Boolean(incomeId)}
      onClose={onClose}
      title="Archive income"
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
        <span className="font-medium text-[color:var(--keel-ink)]">{incomeName}</span> will be
        archived and hidden from pay sources. Commitments and goals that were funded from it move to
        another active income. You can add it again later if needed.
      </p>
      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}
    </GlassSheet>
  );
}
