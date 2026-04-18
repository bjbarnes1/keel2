"use client";

import { useMemo, useState } from "react";

import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import type { CommitmentSkipInput } from "@/lib/types";
import { formatAud } from "@/lib/utils";

import { CommitmentRestoreSheet } from "./commitment-restore-sheet";
import { CommitmentSkipSheet } from "./commitment-skip-sheet";

type Occurrence = { iso: string; amount: number; activeSkipId?: string };

type GoalOption = { id: string; name: string };

function resolvePrefill(prefillSkipDate: string | undefined, occurrences: Occurrence[]) {
  if (!prefillSkipDate || !/^\d{4}-\d{2}-\d{2}$/.test(prefillSkipDate)) {
    return { sheetDate: null as string | null, sheetOpen: false };
  }
  const match = occurrences.find((row) => row.iso === prefillSkipDate && !row.activeSkipId);
  if (!match) {
    return { sheetDate: null as string | null, sheetOpen: false };
  }
  return { sheetDate: match.iso, sheetOpen: true };
}

export function BillEditUpcoming({
  commitmentId,
  commitmentName,
  occurrences,
  goals,
  prefillSkipDate,
  skipPreview,
}: {
  commitmentId: string;
  commitmentName: string;
  occurrences: Occurrence[];
  goals: GoalOption[];
  prefillSkipDate?: string;
  skipPreview: {
    baselineOrdered: ScheduledCashflowEvent[];
    startingAvailableMoney: number;
    existingCommitmentSkips: CommitmentSkipInput[];
  };
}) {
  const initial = useMemo(
    () => resolvePrefill(prefillSkipDate, occurrences),
    [prefillSkipDate, occurrences],
  );
  const [sheetOpen, setSheetOpen] = useState(initial.sheetOpen);
  const [sheetDate, setSheetDate] = useState<string | null>(initial.sheetDate);
  const [restoreSkipId, setRestoreSkipId] = useState<string | null>(null);

  const sheetAmount = useMemo(() => {
    if (!sheetDate) {
      return 0;
    }
    return occurrences.find((row) => row.iso === sheetDate)?.amount ?? 0;
  }, [occurrences, sheetDate]);

  function openSkip(iso: string) {
    setSheetDate(iso);
    setSheetOpen(true);
  }

  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold text-[color:var(--keel-ink)]">Upcoming payments</h2>
      <p className="text-xs text-[color:var(--keel-ink-3)]">Based on your current schedule and due date.</p>
      <ul className="space-y-2">
        {occurrences.length === 0 ? (
          <li className="rounded-[var(--radius-md)] border border-white/10 px-3 py-4 text-sm text-[color:var(--keel-ink-3)]">
            No upcoming occurrences in the next year.
          </li>
        ) : (
          occurrences.map((row) => (
            <li
              key={row.iso}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-white/10 px-3 py-3"
            >
              <div>
                <p className="font-mono text-sm text-[color:var(--keel-ink)]">{row.iso}</p>
                <p className="text-xs text-[color:var(--keel-ink-3)]">{formatAud(row.amount)}</p>
              </div>
              {row.activeSkipId ? (
                <button
                  type="button"
                  onClick={() => setRestoreSkipId(row.activeSkipId!)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink-2)] hover:bg-white/5"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openSkip(row.iso)}
                  className="glass-tint-safe rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-[color:var(--keel-ink)]"
                >
                  Skip payment
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      <CommitmentSkipSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        commitmentId={commitmentId}
        commitmentName={commitmentName}
        amount={sheetAmount}
        originalDateIso={sheetDate ?? occurrences[0]?.iso ?? ""}
        goals={goals}
        baselineOrdered={skipPreview.baselineOrdered}
        startingAvailableMoney={skipPreview.startingAvailableMoney}
        existingCommitmentSkips={skipPreview.existingCommitmentSkips}
      />

      <CommitmentRestoreSheet
        open={restoreSkipId != null}
        onClose={() => setRestoreSkipId(null)}
        skipId={restoreSkipId}
        label={commitmentName}
      />
    </section>
  );
}
