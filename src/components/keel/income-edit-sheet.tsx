"use client";

/**
 * Bottom sheet for editing an income (`updateIncomeFutureAction`), versioned from applies-from date.
 *
 * @module components/keel/income-edit-sheet
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateIncomeFutureAction } from "@/app/actions/keel";
import type { IncomeView } from "@/lib/types";
import { cn, formatDisplayDate, toIsoDate } from "@/lib/utils";

import { GlassSheet } from "@/components/keel/glass-sheet";
import { RecordEditDisclosure } from "@/components/keel/record-edit-sheet";

export type IncomeEditFields = {
  id: string;
  name: string;
  amount: number;
  frequency: IncomeView["frequency"];
  nextPayDate: string;
  isPrimary: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  income: IncomeEditFields | null;
};

export function IncomeEditSheet({ open, onClose, income }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!income) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await updateIncomeFutureAction(fd);
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  }

  if (!income) return null;

  return (
    <GlassSheet open={open && Boolean(income.id)} onClose={onClose} title="Edit income">
      <p className="mb-4 text-sm leading-6 text-[color:var(--keel-ink-3)]">
        Changes apply from the date you pick. Keel keeps today&apos;s pay details until then—past periods
        stay as they were.
      </p>

      <form className="space-y-4 pb-2" onSubmit={onSubmit}>
        <input type="hidden" name="incomeId" value={income.id} />

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Name</span>
          <input
            name="name"
            required
            defaultValue={income.name}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Amount (per pay)</span>
          <input
            name="amount"
            required
            defaultValue={String(income.amount)}
            inputMode="decimal"
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 font-mono text-sm text-[color:var(--keel-ink)] outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Next payday (new version)</span>
          <input
            name="nextPayDate"
            type="date"
            required
            defaultValue={income.nextPayDate}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          />
          <span className="text-[11px] text-[color:var(--keel-ink-4)]">
            Shown in forms as the picker; you read dates elsewhere as {formatDisplayDate(income.nextPayDate)}.
          </span>
        </label>

        <RecordEditDisclosure summary="More options">
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--keel-ink-3)]">How often</span>
            <select
              name="frequency"
              defaultValue={income.frequency}
              className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--keel-ink-3)]">Applies from</span>
            <input
              name="effectiveFrom"
              type="date"
              required
              min={todayIso}
              defaultValue={todayIso}
              className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
            />
          </label>
        </RecordEditDisclosure>

        {income.isPrimary ? (
          <p className="text-xs text-[color:var(--keel-ink-4)]">This is your primary income.</p>
        ) : null}

        {error ? <p className="text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "flex-1 rounded-[var(--radius-md)] border border-white/12 py-3 text-sm font-semibold text-[color:var(--keel-ink)] transition-opacity disabled:opacity-40",
              "glass-tint-safe",
            )}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </GlassSheet>
  );
}
