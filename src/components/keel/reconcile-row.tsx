"use client";

import { useMemo, useState } from "react";

import { updateSpendTransactionAction } from "@/app/actions/keel-spend";
import { SubmitButton } from "@/components/keel/submit-button";
import type { SpendTransactionListItem } from "@/lib/persistence/keel-store";
import { suggestCommitments } from "@/lib/spend/suggest-commitment";
import { formatAud } from "@/lib/utils";

type CategoryOption = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

type CommitmentOption = {
  id: string;
  name: string;
};

export function ReconcileRow({
  transaction,
  categories,
  commitments,
}: {
  transaction: SpendTransactionListItem;
  categories: CategoryOption[];
  commitments: CommitmentOption[];
}) {
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [commitmentId, setCommitmentId] = useState("");

  const subcategories = useMemo(() => {
    return categories.find((category) => category.id === categoryId)?.subcategories ?? [];
  }, [categories, categoryId]);

  const suggestions = useMemo(
    () => suggestCommitments(transaction.memo, commitments, 3),
    [transaction.memo, commitments],
  );

  return (
    <form
      action={updateSpendTransactionAction}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <input type="hidden" name="transactionId" value={transaction.id} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{transaction.memo}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {transaction.postedOn} · {transaction.accountName}
          </p>
        </div>
        <p className="font-mono text-sm font-semibold">{formatAud(transaction.amount)}</p>
      </div>

      {suggestions.length ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Suggested commitments
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => setCommitmentId(suggestion.id)}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
              >
                {suggestion.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="block space-y-1 text-xs text-muted-foreground">
        Category
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setSubcategoryId("");
          }}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">Choose a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      {subcategories.length ? (
        <label className="block space-y-1 text-xs text-muted-foreground">
          Subcategory (optional)
          <select
            name="subcategoryId"
            value={subcategoryId}
            onChange={(event) => setSubcategoryId(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">None</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="subcategoryId" value="" />
      )}

      <label className="block space-y-1 text-xs text-muted-foreground">
        Link to commitment (optional)
        <select
          name="commitmentId"
          value={commitmentId}
          onChange={(event) => setCommitmentId(event.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">No match yet</option>
          {commitments.map((commitment) => (
            <option key={commitment.id} value={commitment.id}>
              {commitment.name}
            </option>
          ))}
        </select>
      </label>

      <SubmitButton
        label="Save tagging"
        pendingLabel="Saving…"
        variant="soft"
        className="rounded-xl py-2"
        disabled={!categoryId}
      />
    </form>
  );
}
