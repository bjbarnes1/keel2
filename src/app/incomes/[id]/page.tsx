/**
 * Income detail: hero + read-only upcoming pay events. Skip functionality is deferred.
 *
 * @module app/incomes/[id]/page
 */

import { notFound } from "next/navigation";

import { collectScheduledProjectionEvents } from "@/lib/engine/keel";
import { getDashboardSnapshot, getIncomeForEdit } from "@/lib/persistence/keel-store";

import { IncomeDetailClient } from "@/components/keel/income-detail-client";

export const dynamic = "force-dynamic";

function upcomingCount(frequency: string): number {
  switch (frequency) {
    case "weekly":
      return 10;
    case "fortnightly":
      return 10;
    case "monthly":
      return 6;
    case "quarterly":
      return 4;
    case "annual":
      return 3;
    default:
      return 6;
  }
}

export default async function IncomeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const snapshot = await getDashboardSnapshot();
  const income = snapshot.incomes.find((row) => row.id === id) ?? null;
  if (!income) {
    notFound();
  }

  const edit = await getIncomeForEdit(id);
  if (!edit) {
    notFound();
  }

  const asOf = new Date(`${snapshot.balanceAsOfIso}T00:00:00Z`);
  const horizonDays = 366;
  const schedule = collectScheduledProjectionEvents({
    asOf,
    horizonDays,
    incomes: [
      {
        id: edit.id,
        name: edit.name,
        amount: edit.amount,
        frequency: edit.frequency,
        nextPayDate: edit.nextPayDate,
      },
    ],
    commitments: [],
  })
    .filter((e) => e.type === "income")
    .slice(0, upcomingCount(edit.frequency))
    .map((e) => ({ iso: e.date, amount: e.amount }));

  return (
    <IncomeDetailClient
      incomeId={id}
      income={edit}
      isPrimary={id === snapshot.primaryIncomeId}
      upcoming={schedule}
    />
  );
}

