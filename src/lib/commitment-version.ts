/**
 * Effective-dating helper for commitment version rows (mirrors income versioning).
 *
 * Given an array of historical versions each with `[effectiveFrom, effectiveTo)`,
 * picks the row that should apply on `asOfIso` for projection recomputation.
 *
 * @module lib/commitment-version
 */

import { isRangeActiveOn, type VersionRange } from "@/lib/income-version";

export type CommitmentVersionSlice = VersionRange & {
  name: string;
  amount: number;
  frequency: string;
  nextDueDate: Date;
  categoryId: string;
  subcategoryId: string | null;
  fundedByIncomeId: string | null;
};

export function pickCommitmentVersionAt(
  versions: CommitmentVersionSlice[],
  asOfIso: string,
) {
  const matching = versions.filter((version) => isRangeActiveOn(version, asOfIso));
  if (matching.length === 0) {
    return null;
  }
  return matching.sort(
    (left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
  )[0]!;
}

