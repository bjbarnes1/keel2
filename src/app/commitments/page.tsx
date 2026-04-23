/**
 * Commitments index: server-loads snapshot, archived rows, edit payloads, skip preview.
 *
 * @module app/commitments/page
 */

import { annualizeAmount } from "@/lib/engine/keel";
import {
  getCategoryOptions,
  getCommitmentForEdit,
  getCommitmentSkipPreviewBundle,
  getDashboardSnapshot,
  listArchivedCommitmentsForBrowse,
} from "@/lib/persistence/keel-store";

import type { CommitmentFields } from "@/components/keel/commitment-edit-sheet";
import { CommitmentsBrowseClient } from "@/components/keel/commitments-browse-client";

export const dynamic = "force-dynamic";

function mapStoredToEditFields(
  row: NonNullable<Awaited<ReturnType<typeof getCommitmentForEdit>>>,
): CommitmentFields {
  return {
    name: row.name,
    amount: row.amount,
    frequency: row.frequency,
    nextDueDate: row.nextDueDate,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    fundedByIncomeId: row.fundedByIncomeId,
  };
}

export default async function CommitmentsPage() {
  const snapshot = await getDashboardSnapshot();
  const skipPreview = await getCommitmentSkipPreviewBundle(snapshot);
  const goals = snapshot.goals.map((goal) => ({ id: goal.id, name: goal.name }));
  const summaryAnnualized = snapshot.commitments.reduce(
    (sum, c) => sum + annualizeAmount(c.amount, c.frequency),
    0,
  );
  const archived = await listArchivedCommitmentsForBrowse();
  const categories = await getCategoryOptions();

  const editIds = [...snapshot.commitments, ...archived].map((c) => c.id);
  const editPayloadsById: Record<string, CommitmentFields | null> = {};
  for (const id of editIds) {
    const row = await getCommitmentForEdit(id);
    editPayloadsById[id] = row ? mapStoredToEditFields(row) : null;
  }

  return (
    <CommitmentsBrowseClient
      commitments={snapshot.commitments}
      archivedCommitments={archived}
      goals={goals}
      skipPreview={skipPreview}
      summaryReserved={snapshot.totalReserved}
      summaryAnnualized={summaryAnnualized}
      categories={categories}
      incomes={snapshot.incomes}
      primaryIncomeId={snapshot.primaryIncomeId}
      editPayloadsById={editPayloadsById}
    />
  );
}
