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
