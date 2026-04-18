"use client";

import { useMemo, useState } from "react";

import type { EngineGoal } from "@/lib/engine/keel";
import type { GoalSkipInput, PayFrequency } from "@/lib/types";
import { formatAud } from "@/lib/utils";

import { GoalRestoreSheet } from "./goal-restore-sheet";
import { GoalSkipSheet } from "./goal-skip-sheet";

type Occurrence = { iso: string; amount: number; activeSkipId?: string };

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

export function GoalDetailUpcoming({
  goalId,
  goalName,
  occurrences,
  prefillSkipDate,
  baseGoal,
  existingGoalSkips,
  payFrequency,
}: {
  goalId: string;
  goalName: string;
  occurrences: Occurrence[];
  prefillSkipDate?: string;
  baseGoal: EngineGoal;
  existingGoalSkips: GoalSkipInput[];
  payFrequency: PayFrequency;
}) {
  const initial = useMemo(
    () => resolvePrefill(prefillSkipDate, occurrences),
    [prefillSkipDate, occurrences],
  );
  const [sheetOpen, setSheetOpen] = useState(initial.sheetOpen);
  const [sheetDate, setSheetDate] = useState<string | null>(initial.sheetDate);
  const [restoreSkipId, setRestoreSkipId] = useState<string | null>(null);

  function openSkip(iso: string) {
    setSheetDate(iso);
    setSheetOpen(true);
  }

  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold text-[color:var(--keel-ink)]">Upcoming transfers</h2>
      <p className="text-xs text-[color:var(--keel-ink-3)]">Aligned to your funding income pay dates.</p>
      <ul className="space-y-2">
        {occurrences.map((row) => (
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
                Skip transfer
              </button>
            )}
          </li>
        ))}
      </ul>

      <GoalSkipSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        goalId={goalId}
        goalName={goalName}
        originalDateIso={sheetDate ?? occurrences[0]?.iso ?? ""}
        baseGoal={baseGoal}
        existingGoalSkips={existingGoalSkips}
        payFrequency={payFrequency}
      />

      <GoalRestoreSheet
        open={restoreSkipId != null}
        onClose={() => setRestoreSkipId(null)}
        skipId={restoreSkipId}
        goalName={goalName}
      />
    </section>
  );
}
