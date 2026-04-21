"use client";

/**
 * Bottom sheet for editing a commitment (`updateCommitmentAction`, per-pay preview).
 *
 * @module components/keel/commitment-edit-sheet
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { updateCommitmentAction } from "@/app/actions/keel";
import { calculatePerPayAmount } from "@/lib/engine/keel";
import type { CommitmentFrequency, IncomeView } from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

import { GlassSheet } from "@/components/keel/glass-sheet";
import { SurfaceCard } from "@/components/keel/primitives";

type CategoryOption = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

type CommitmentFields = {
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string;
  categoryId: string;
  subcategoryId?: string;
  fundedByIncomeId?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commitmentId: string;
  commitment: CommitmentFields;
  displayPerPay: number;
  categories: CategoryOption[];
  incomes: IncomeView[];
  primaryIncomeId: string;
};

export function CommitmentEditSheet({
  open,
  onClose,
  commitmentId,
  commitment,
  displayPerPay,
  categories,
  incomes,
  primaryIncomeId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(commitment.amount));
  const [frequency, setFrequency] = useState<CommitmentFrequency>(commitment.frequency);
  const [fundedByIncomeId, setFundedByIncomeId] = useState(
    commitment.fundedByIncomeId ?? primaryIncomeId,
  );
  const [categoryId, setCategoryId] = useState(commitment.categoryId);

  const fundedIncome = useMemo(
    () => incomes.find((i) => i.id === fundedByIncomeId) ?? incomes[0],
    [fundedByIncomeId, incomes],
  );

  const previewPerPay = useMemo(() => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || !fundedIncome) {
      return displayPerPay;
    }
    return calculatePerPayAmount(n, frequency, fundedIncome.frequency);
  }, [amount, displayPerPay, frequency, fundedIncome]);

  const subcategories = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId],
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!commitmentId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await updateCommitmentAction(commitmentId, fd);
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  }

  return (
    <GlassSheet open={open && Boolean(commitmentId)} onClose={onClose} title="Edit commitment">
      <form className="space-y-4 pb-2" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Funded from</span>
          <select
            name="fundedByIncomeId"
            value={fundedByIncomeId}
            onChange={(ev) => setFundedByIncomeId(ev.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          >
            {incomes.map((income) => (
              <option key={income.id} value={income.id}>
                {income.name} · {sentenceCaseFrequency(income.frequency)}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Name</span>
          <input
            name="name"
            defaultValue={commitment.name}
            required
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Amount</span>
          <input
            name="amount"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
            required
            inputMode="decimal"
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 font-mono text-sm text-[color:var(--keel-ink)] outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Frequency</span>
          <select
            name="frequency"
            value={frequency}
            onChange={(ev) => setFrequency(ev.target.value as CommitmentFrequency)}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Next due</span>
          <input
            name="nextDueDate"
            type="date"
            required
            defaultValue={commitment.nextDueDate}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-[color:var(--keel-ink-3)]">Category</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(ev) => setCategoryId(ev.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
          >
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        {subcategories.length > 0 ? (
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--keel-ink-3)]">Subcategory</span>
            <select
              name="subcategoryId"
              defaultValue={commitment.subcategoryId ?? ""}
              className="w-full rounded-[var(--radius-md)] border border-white/12 bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none"
            >
              <option value="">None</option>
              {subcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="subcategoryId" value={commitment.subcategoryId ?? ""} />
        )}

        <SurfaceCard className="glass-tint-safe !p-3">
          <p className="text-xs text-[color:var(--keel-ink-3)]">Per-pay reservation (preview)</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(previewPerPay)}
            <span className="ml-1 font-sans text-xs font-normal text-[color:var(--keel-ink-3)]">/pay</span>
          </p>
        </SurfaceCard>

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
