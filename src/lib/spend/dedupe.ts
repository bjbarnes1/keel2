/**
 * Deterministic hash key for imported spend rows so re-imports can upsert safely.
 *
 * Normalizes memo whitespace + case; uses fixed-point amount string to avoid float drift.
 *
 * @module lib/spend/dedupe
 */

import { createHash } from "node:crypto";

export function spendTransactionDedupeKey(input: {
  accountId: string;
  postedOn: string;
  amount: number;
  memo: string;
}) {
  const normalizedMemo = input.memo.trim().replace(/\s+/g, " ").toLowerCase();
  const payload = [
    input.accountId,
    input.postedOn,
    input.amount.toFixed(4),
    normalizedMemo,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}
