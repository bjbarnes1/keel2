export type IncomeVersionSlice = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  name: string;
  amount: number;
  frequency: string;
  nextPayDate: Date;
};

/**
 * Pick the income definition that is active on `asOfIso` (YYYY-MM-DD, UTC calendar day).
 */
export function pickIncomeVersionAt(
  versions: IncomeVersionSlice[],
  asOfIso: string,
): IncomeVersionSlice | null {
  if (versions.length === 0) {
    return null;
  }

  const matching = versions.filter((version) => {
    const from = version.effectiveFrom.toISOString().slice(0, 10);
    const to = version.effectiveTo ? version.effectiveTo.toISOString().slice(0, 10) : null;
    return from <= asOfIso && (to === null || to >= asOfIso);
  });

  if (matching.length === 0) {
    return null;
  }

  return matching.sort(
    (left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
  )[0]!;
}
