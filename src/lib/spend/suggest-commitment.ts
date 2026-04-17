export type CommitmentCandidate = {
  id: string;
  name: string;
};

export type CommitmentSuggestion = CommitmentCandidate & {
  score: number;
};

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function tokenSet(value: string) {
  return new Set(tokenize(value));
}

/**
 * Lightweight matching for bank memo text → bill names (no ML).
 * Higher score = better guess; filter client-side if you only want strong matches.
 */
export function suggestCommitments(
  memo: string,
  commitments: CommitmentCandidate[],
  limit = 3,
): CommitmentSuggestion[] {
  const memoNorm = normalizeForMatch(memo);
  if (!memoNorm || commitments.length === 0) {
    return [];
  }

  const memoTokens = tokenSet(memo);

  const scored = commitments.map((commitment) => {
    const nameNorm = normalizeForMatch(commitment.name);
    let score = 0;

    if (nameNorm.length >= 3 && memoNorm.includes(nameNorm)) {
      score += 120;
    }

    const nameTokens = tokenize(commitment.name);
    for (const token of nameTokens) {
      if (token.length < 3) {
        continue;
      }
      if (memoTokens.has(token)) {
        score += 35;
      }
      if (memoNorm.includes(token)) {
        score += 25;
      }
    }

    const initials = nameTokens.map((word) => word[0]).join("");
    if (initials.length >= 2 && memoNorm.includes(initials)) {
      score += 15;
    }

    return { ...commitment, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
