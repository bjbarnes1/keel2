/**
 * Pulls settled Up transactions into `SpendTransaction` rows for the linked `SpendAccount`
 * (`upAccountId`). Idempotent on `(budgetId, externalSource, externalId)`; applies
 * {@link resolveCategoryFromRules} when `categoryId` is still empty.
 *
 * @module lib/up/sync-up-transactions
 */

import { getPrismaClient } from "@/lib/prisma";
import { spendTransactionDedupeKey } from "@/lib/spend/dedupe";

import { fetchAllUpTransactionsSince } from "./up-client";
import { resolveCategoryFromRules } from "@/lib/persistence/spend-rules";

const EXTERNAL = "up" as const;

function postedOnFromUp(tx: { attributes: { settledAt: string | null; createdAt: string } }) {
  const raw = tx.attributes.settledAt ?? tx.attributes.createdAt;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export type UpSyncResult = {
  upserted: number;
  skippedOtherAccount: number;
  accountUpId: string;
};

export async function syncUpTransactionsForBudget(input: {
  budgetId: string;
  spendAccountId: string;
  token: string;
  /** ISO date (YYYY-MM-DD) — fetch SETTLED txns since this day (inclusive). */
  since: string;
}): Promise<UpSyncResult> {
  const prisma = getPrismaClient();

  const account = await prisma.spendAccount.findFirst({
    where: { id: input.spendAccountId, budgetId: input.budgetId },
  });
  if (!account?.upAccountId) {
    throw new Error("Spend account is not linked to Up (missing upAccountId).");
  }

  const upAccountId = account.upAccountId;
  const sinceIso = `${input.since}T00:00:00+10:00`;

  const remote = await fetchAllUpTransactionsSince(input.token, sinceIso);
  let upserted = 0;
  let skippedOtherAccount = 0;

  for (const tx of remote) {
    const accRel = tx.relationships?.account?.data?.id;
    if (accRel !== upAccountId) {
      skippedOtherAccount += 1;
      continue;
    }

    const amountAud = Number.parseFloat(tx.attributes.amount.value);
    const memoParts = [tx.attributes.description, tx.attributes.message].filter(Boolean);
    const memo = memoParts.join(" — ").slice(0, 512);

    const postedOn = postedOnFromUp(tx);
    const postedDate = new Date(`${postedOn}T00:00:00Z`);

    const dedupeKey = spendTransactionDedupeKey({
      accountId: account.id,
      postedOn,
      amount: amountAud,
      memo,
    });

    const matched = await resolveCategoryFromRules({
      budgetId: input.budgetId,
      memo,
    });

    const existingByExternal = await prisma.spendTransaction.findFirst({
      where: {
        budgetId: input.budgetId,
        externalSource: EXTERNAL,
        externalId: tx.id,
      },
    });

    const existing =
      existingByExternal ??
      (await prisma.spendTransaction.findUnique({
        where: {
          budgetId_dedupeKey: { budgetId: input.budgetId, dedupeKey },
        },
      }));

    if (existing) {
      const categoryId =
        existing.categoryId != null
          ? existing.categoryId
          : matched?.categoryId ?? null;
      const subcategoryId =
        existing.subcategoryId != null
          ? existing.subcategoryId
          : matched?.subcategoryId ?? null;

      await prisma.spendTransaction.update({
        where: { id: existing.id },
        data: {
          amount: amountAud,
          memo,
          postedOn: postedDate,
          dedupeKey,
          externalSource: EXTERNAL,
          externalId: tx.id,
          ...(existing.categoryId == null && categoryId
            ? { categoryId, subcategoryId }
            : {}),
        },
      });
      upserted += 1;
      continue;
    }

    await prisma.spendTransaction.create({
      data: {
        budgetId: input.budgetId,
        accountId: account.id,
        postedOn: postedDate,
        amount: amountAud,
        memo,
        dedupeKey,
        externalSource: EXTERNAL,
        externalId: tx.id,
        categoryId: matched?.categoryId ?? null,
        subcategoryId: matched?.subcategoryId ?? null,
      },
    });
    upserted += 1;
  }

  await prisma.spendAccount.update({
    where: { id: account.id },
    data: { upLastSyncedAt: new Date() },
  });

  return { upserted, skippedOtherAccount, accountUpId: upAccountId };
}
