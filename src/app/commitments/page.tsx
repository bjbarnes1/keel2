/**
 * Commitments index: server-loads snapshot, archived rows, edit payloads, skip preview.
 *
 * Performance notes:
 *  - `getDashboardSnapshot`, `listArchivedCommitmentsForBrowse`, and `getCategoryOptions`
 *    are independent reads and run in parallel via `Promise.all`.
 *  - Edit payloads for every visible row are loaded in a single batch query
 *    (`getCommitmentsForEditBatch`) — previously this was an N+1 loop.
 *
 * @module app/commitments/page
 */

import { annualizeAmount } from "@/lib/engine/keel";
import {
  getCategoryOptions,
  getCommitmentsForEditBatch,
  getCommitmentSkipPreviewBundle,
  getDashboardSnapshot,
  listArchivedCommitmentsForBrowse,
} from "@/lib/persistence/keel-store";

import type { CommitmentFields } from "@/components/keel/commitment-edit-sheet";
import { CommitmentsBrowseClient } from "@/components/keel/commitments-browse-client";

export const dynamic = "force-dynamic";

function mapStoredToEditFields(
  row: NonNullable<
    Awaited<ReturnType<typeof getCommitmentsForEditBatch>>[string]
  >,
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
  // Three independent reads in flight at once; the page is gated on the slowest, not the sum.
  const [snapshot, archived, categories] = await Promise.all([
    getDashboardSnapshot(),
    listArchivedCommitmentsForBrowse(),
    getCategoryOptions(),
  ]);

  // Skip-preview derives purely from the snapshot (no I/O) — can only run after it resolves.
  const skipPreview = await getCommitmentSkipPreviewBundle(snapshot);

  const goals = snapshot.goals.map((goal) => ({ id: goal.id, name: goal.name }));
  const summaryAnnualized = snapshot.commitments.reduce(
    (sum, c) => sum + annualizeAmount(c.amount, c.frequency),
    0,
  );

  const editIds = [...snapshot.commitments, ...archived].map((c) => c.id);
  const editRows = await getCommitmentsForEditBatch(editIds);
  const editPayloadsById: Record<string, CommitmentFields | null> = {};
  for (const id of editIds) {
    const row = editRows[id];
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
