"use client";

/**
 * Bottom sheet for editing a commitment via {@link RecordEditSheet} and
 * {@link saveCommitmentEditFromSheet} (versioned applies-from, no redirect).
 *
 * @module components/keel/commitment-edit-sheet
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { saveCommitmentEditFromSheet } from "@/app/actions/keel";
import { calculatePerPayAmount } from "@/lib/engine/keel";
import type { CommitmentEditValues } from "@/lib/schemas/record-edit-schemas";
import {
  commitmentEditSchema,
  commitmentEditSections,
} from "@/lib/schemas/record-edit-schemas";
import type { CommitmentFrequency, IncomeView } from "@/lib/types";
import { formatAud, sentenceCaseFrequency, toIsoDate } from "@/lib/utils";

import { RecordEditSheet } from "@/components/keel/record-edit-sheet";
import { SurfaceCard } from "@/components/keel/primitives";

type CategoryOption = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

export type CommitmentFields = {
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

  const initialRecord = useMemo<CommitmentEditValues>(
    () => ({
      name: commitment.name,
      amount: commitment.amount,
      frequency: commitment.frequency,
      nextDueDate: commitment.nextDueDate,
      categoryId: commitment.categoryId,
      subcategoryId: commitment.subcategoryId ?? "",
      fundedByIncomeId: commitment.fundedByIncomeId ?? primaryIncomeId,
    }),
    [commitment, primaryIncomeId],
  );

  const [live, setLive] = useState<CommitmentEditValues>(initialRecord);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setLive(initialRecord));
  }, [open, initialRecord]);

  const fieldOptions = useMemo(() => {
    const catId = live.categoryId;
    const cat = categories.find((c) => c.id === catId);
    const subs = cat?.subcategories ?? [];
    return {
      categoryId: categories.map((c) => ({ value: c.id, label: c.name })),
      subcategoryId: [{ value: "", label: "None" }, ...subs.map((s) => ({ value: s.id, label: s.name }))],
      fundedByIncomeId: incomes.map((i) => ({
        value: i.id,
        label: `${i.name} · ${sentenceCaseFrequency(i.frequency)}`,
      })),
    };
  }, [categories, incomes, live.categoryId]);

  return (
    <RecordEditSheet<CommitmentEditValues>
      key={commitmentId}
      open={open && Boolean(commitmentId)}
      onClose={onClose}
      recordType="commitment"
      record={initialRecord}
      schema={commitmentEditSchema}
      sections={commitmentEditSections}
      title="Edit commitment"
      fieldOptions={fieldOptions}
      onValuesChange={setLive}
      onSubmit={async (data, appliesFrom) => {
        await saveCommitmentEditFromSheet({
          commitmentId,
          data,
          appliesFromIso: toIsoDate(appliesFrom),
        });
        router.refresh();
      }}
      afterFields={(v) => {
        const inc = incomes.find((i) => i.id === v.fundedByIncomeId) ?? incomes[0];
        const pp =
          inc && Number.isFinite(v.amount)
            ? calculatePerPayAmount(v.amount, v.frequency, inc.frequency)
            : displayPerPay;
        return (
          <SurfaceCard className="glass-tint-safe !p-3">
            <p className="text-xs text-[color:var(--keel-ink-3)]">Per-pay reservation (preview)</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(pp)}
              <span className="ml-1 font-sans text-xs font-normal text-[color:var(--keel-ink-3)]">/pay</span>
            </p>
          </SurfaceCard>
        );
      }}
    />
  );
}
