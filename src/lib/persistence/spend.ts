import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { encryptBankSecret, maskBankAccount } from "@/lib/security/secrets";
import { spendTransactionDedupeKey } from "@/lib/spend/dedupe";
import { buildSpendRows, parseCsv, validateSpendCsvMapping, type SpendCsvMapping } from "@/lib/spend/csv";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

export type SpendAccountView = {
  id: string;
  name: string;
  currency: string;
  bankName?: string;
  bsb?: string;
  accountName?: string;
  maskedAccountNumber?: string;
};

export type SpendTransactionListItem = {
  id: string;
  accountId: string;
  accountName: string;
  postedOn: string;
  amount: number;
  memo: string;
  categoryId?: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategoryName?: string;
  commitmentId?: string;
  commitmentName?: string;
};

export async function getRecentSpendForCommitment(commitmentId: string, take = 8) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  return prisma.spendTransaction.findMany({
    where: { budgetId: budget.id, commitmentId },
    orderBy: { postedOn: "desc" },
    take,
    select: { id: true, postedOn: true, amount: true, memo: true },
  });
}

export async function getSpendOverview() {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return {
      accounts: [] as SpendAccountView[],
      recent: [] as SpendTransactionListItem[],
      needsReview: 0,
    };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const [accounts, recent, needsReview] = await Promise.all([
    prisma.spendAccount.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.spendTransaction.findMany({
      where: { budgetId: budget.id },
      orderBy: [{ postedOn: "desc" }, { id: "desc" }],
      take: 10,
      include: {
        account: true,
        categoryRef: true,
        subcategoryRef: true,
        commitment: true,
      },
    }),
    prisma.spendTransaction.count({
      where: { budgetId: budget.id, categoryId: null },
    }),
  ]);

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      bankName: account.bankName ?? undefined,
      bsb: account.bsb ?? undefined,
      accountName: account.accountName ?? undefined,
      maskedAccountNumber: maskBankAccount(account.accountNumberLastFour),
    })),
    recent: recent.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      postedOn: t.postedOn.toISOString().slice(0, 10),
      amount: Number(t.amount),
      memo: t.memo,
      categoryId: t.categoryId ?? undefined,
      categoryName: t.categoryRef?.name,
      subcategoryId: t.subcategoryId ?? undefined,
      subcategoryName: t.subcategoryRef?.name,
      commitmentId: t.commitmentId ?? undefined,
      commitmentName: t.commitment?.name,
    })),
    needsReview,
  };
}

export async function createSpendAccount(input: {
  name: string;
  bankName?: string;
  bsb?: string;
  accountName?: string;
  accountNumber?: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const name = input.name.trim();
  if (!name) throw new Error("Account name is required.");

  const bankName = input.bankName?.trim() || null;
  const bsb = input.bsb?.trim() || null;
  const accountName = input.accountName?.trim() || null;
  const accountNumberRaw = input.accountNumber?.trim() || "";
  const accountDigits = accountNumberRaw.replace(/\s+/g, "");
  const lastFour = accountDigits.replace(/\D/g, "").slice(-4) || null;

  const encrypted = accountNumberRaw.trim()
    ? encryptBankSecret(accountNumberRaw.trim())
    : null;

  await prisma.spendAccount.create({
    data: {
      budgetId: budget.id,
      name,
      currency: "AUD",
      bankName,
      bsb,
      accountName,
      accountNumberEnc: encrypted?.enc ?? null,
      accountNumberIv: encrypted?.iv ?? null,
      accountNumberLastFour: lastFour,
    },
  });
}

export async function commitSpendCsvImport(input: {
  accountId: string;
  csvText: string;
  mapping: SpendCsvMapping;
  filename?: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend import requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const account = await prisma.spendAccount.findFirst({
    where: { id: input.accountId, budgetId: budget.id },
  });
  if (!account) throw new Error("Account not found.");

  const parsed = parseCsv(input.csvText);
  const mappingError = validateSpendCsvMapping(parsed.headers, input.mapping);
  if (mappingError) throw new Error(mappingError);

  const built = buildSpendRows(parsed.headers, parsed.rows, input.mapping);
  if (built.rows.length === 0) {
    const firstIssue = [...parsed.errors, ...built.errors][0];
    throw new Error(firstIssue?.message ?? "No importable rows were found.");
  }

  const batch = await prisma.spendImportBatch.create({
    data: {
      budgetId: budget.id,
      accountId: account.id,
      filename: input.filename ?? null,
      rowCount: 0,
    },
  });

  const data = built.rows.map((row) => ({
    budgetId: budget.id,
    accountId: account.id,
    importBatchId: batch.id,
    postedOn: new Date(`${row.postedOn}T00:00:00Z`),
    amount: row.amount,
    memo: row.memo,
    dedupeKey: spendTransactionDedupeKey({
      accountId: account.id,
      postedOn: row.postedOn,
      amount: row.amount,
      memo: row.memo,
    }),
  }));

  const result = await prisma.spendTransaction.createMany({
    data,
    skipDuplicates: true,
  });

  await prisma.spendImportBatch.update({
    where: { id: batch.id },
    data: { rowCount: result.count },
  });

  return {
    inserted: result.count,
    skipped: data.length - result.count,
    issueCount: parsed.errors.length + built.errors.length,
  };
}

export async function getBudgetCommitmentsForTagging() {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [] as Array<{ id: string; name: string }>;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const commitments = await prisma.commitment.findMany({
    where: { budgetId: budget.id, isPaused: false, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return commitments.map((c) => ({ id: c.id, name: c.name }));
}

export async function getSpendReconciliationQueue(limit = 80) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [] as SpendTransactionListItem[];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const rows = await prisma.spendTransaction.findMany({
    where: { budgetId: budget.id, categoryId: null },
    orderBy: [{ postedOn: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      account: true,
      categoryRef: true,
      subcategoryRef: true,
      commitment: true,
    },
  });

  return rows.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    accountName: t.account.name,
    postedOn: t.postedOn.toISOString().slice(0, 10),
    amount: Number(t.amount),
    memo: t.memo,
    categoryId: t.categoryId ?? undefined,
    categoryName: t.categoryRef?.name,
    subcategoryId: t.subcategoryId ?? undefined,
    subcategoryName: t.subcategoryRef?.name,
    commitmentId: t.commitmentId ?? undefined,
    commitmentName: t.commitment?.name,
  }));
}

export async function updateSpendTransactionClassification(input: {
  transactionId: string;
  categoryId: string | null;
  subcategoryId?: string | null;
  commitmentId?: string | null;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const transaction = await prisma.spendTransaction.findFirst({
    where: { id: input.transactionId, budgetId: budget.id },
  });
  if (!transaction) throw new Error("Transaction not found.");

  let categoryId = input.categoryId;
  let subcategoryId = input.subcategoryId ?? null;

  if (!categoryId) {
    categoryId = null;
    subcategoryId = null;
  }

  if (subcategoryId && categoryId) {
    const subcategory = await prisma.subcategory.findFirst({
      where: { id: subcategoryId, categoryId },
    });
    if (!subcategory) {
      throw new Error("Subcategory does not match the selected category.");
    }
  }

  const commitmentId = input.commitmentId ?? null;
  if (commitmentId) {
    const commitment = await prisma.commitment.findFirst({
      where: { id: commitmentId, budgetId: budget.id },
    });
    if (!commitment) throw new Error("Commitment not found.");
  }

  await prisma.spendTransaction.update({
    where: { id: transaction.id },
    data: { categoryId, subcategoryId, commitmentId },
  });
}
