import { notFound } from "next/navigation";

import { listCommitmentBillOccurrences } from "@/lib/engine/keel";
import {
  getCategoryOptions,
  getCommitmentForEdit,
  getCommitmentSkipPreviewBundle,
  getDashboardSnapshot,
  getRecentSpendForCommitment,
  getSkipHistoryForCommitment,
} from "@/lib/persistence/keel-store";

import { CommitmentDetailClient } from "@/components/keel/commitment-detail-client";

export const dynamic = "force-dynamic";

export default async function CommitmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skipDate?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const snapshot = await getDashboardSnapshot();
  const display = snapshot.commitments.find((c) => c.id === id);
  const commitment = await getCommitmentForEdit(id);

  if (!display || !commitment) {
    notFound();
  }

  const skipPreview = await getCommitmentSkipPreviewBundle(snapshot);
  const categories = await getCategoryOptions();
  const skipHistory = await getSkipHistoryForCommitment(id);
  const activeSkipByIso = new Map(
    skipHistory
      .filter((row) => !row.revokedAt)
      .map((row) => [row.originalDate.toISOString().slice(0, 10), row.id]),
  );

  const asOf = new Date(`${snapshot.balanceAsOfIso}T00:00:00Z`);
  const upcomingBills = listCommitmentBillOccurrences({
    commitment: {
      id: commitment.id,
      name: commitment.name,
      amount: commitment.amount,
      frequency: commitment.frequency,
      nextDueDate: commitment.nextDueDate,
      fundedByIncomeId: commitment.fundedByIncomeId,
      category: commitment.category,
    },
    asOf,
    horizonDays: 400,
  });

  const future = upcomingBills
    .filter((event) => event.date >= snapshot.balanceAsOfIso)
    .slice(0, 3);
  const occurrences = future.map((event) => ({
    iso: event.date,
    amount: event.amount,
    activeSkipId: activeSkipByIso.get(event.date),
  }));

  const orderedIncomes = snapshot.incomes.slice().sort((left, right) => {
    if (left.id === snapshot.primaryIncomeId) return -1;
    if (right.id === snapshot.primaryIncomeId) return 1;
    return left.name.localeCompare(right.name);
  });

  const goals = snapshot.goals.map((goal) => ({ id: goal.id, name: goal.name }));

  const spendRows = await getRecentSpendForCommitment(id);
  const recentSpend = spendRows.map((tx) => ({
    id: tx.id,
    memo: tx.memo,
    amount: Number(tx.amount),
    postedOnIso: tx.postedOn.toISOString().slice(0, 10),
  }));

  const ratio =
    snapshot.annualIncomeForecast > 0
      ? snapshot.annualCommitmentsForecast / snapshot.annualIncomeForecast
      : 0;
  const keelNoticed =
    ratio > 0.55
      ? `Across your budget, commitments are about ${Math.round(ratio * 100)}% of forecast income. If cash feels tight, trimming or rescheduling one commitment moves the needle.`
      : "Commitments are a modest share of your forecast income this year.";

  return (
    <CommitmentDetailClient
      key={`${id}-${query.skipDate ?? ""}`}
      commitmentId={id}
      display={display}
      editFields={{
        name: commitment.name,
        amount: commitment.amount,
        frequency: commitment.frequency,
        nextDueDate: commitment.nextDueDate,
        categoryId: commitment.categoryId,
        subcategoryId: commitment.subcategoryId,
        fundedByIncomeId: commitment.fundedByIncomeId,
      }}
      incomes={orderedIncomes}
      primaryIncomeId={snapshot.primaryIncomeId}
      categories={categories}
      goals={goals}
      skipPreview={skipPreview}
      occurrences={occurrences}
      prefillSkipDate={query.skipDate}
      recentSpend={recentSpend}
      keelNoticed={keelNoticed}
    />
  );
}
