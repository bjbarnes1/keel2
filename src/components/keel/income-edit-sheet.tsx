"use client";

/**
 * Bottom sheet for editing an income via {@link RecordEditSheet} and
 * {@link saveIncomeEditFromSheet} (no redirect — safe from detail routes).
 *
 * @module components/keel/income-edit-sheet
 */

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { saveIncomeEditFromSheet } from "@/app/actions/keel";
import type { IncomeEditValues } from "@/lib/schemas/record-edit-schemas";
import { incomeEditSchema, incomeEditSections } from "@/lib/schemas/record-edit-schemas";
import type { IncomeView } from "@/lib/types";
import { toIsoDate } from "@/lib/utils";

import { RecordEditSheet } from "@/components/keel/record-edit-sheet";

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

  const record = useMemo<IncomeEditValues | null>(() => {
    if (!income) return null;
    return {
      name: income.name,
      amount: income.amount,
      frequency: income.frequency,
      nextPayDate: income.nextPayDate,
    };
  }, [income]);

  if (!income || !record) return null;

  return (
    <RecordEditSheet<IncomeEditValues>
      key={income.id}
      open={open}
      onClose={onClose}
      recordType="income"
      record={record}
      schema={incomeEditSchema}
      sections={incomeEditSections}
      title="Edit income"
      onSubmit={async (data, appliesFrom) => {
        await saveIncomeEditFromSheet({
          incomeId: income.id,
          data,
          appliesFromIso: toIsoDate(appliesFrom),
        });
        router.refresh();
      }}
      afterFields={() =>
        income.isPrimary ? (
          <p className="text-xs text-[color:var(--keel-ink-4)]">This is your primary income.</p>
        ) : null
      }
    />
  );
}
