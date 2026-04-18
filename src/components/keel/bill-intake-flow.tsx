"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createCommitmentAction } from "@/app/actions/keel";
import { SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { calculatePerPayAmount } from "@/lib/engine/keel";
import type {
  CommitmentFrequency,
  IncomeView,
} from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

type ParsedBillResponse = {
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string | null;
  category: string;
  perPay: number;
};

type BillDraft = {
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string;
  categoryId: string;
  subcategoryId?: string;
  fundedByIncomeId: string;
};

const FREQUENCY_OPTIONS: { value: CommitmentFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const examples = [
  {
    prompt: "Car insurance is $480 every quarter, due June 15",
    parsed: {
      name: "Car Insurance",
      amount: 480,
      frequency: "Quarterly",
      nextDueDate: "Jun 15, 2026",
      category: "Insurance",
      perPay: 80,
    },
  },
  {
    prompt: "Netflix 22.99 a month renews on the 19th",
    parsed: {
      name: "Netflix",
      amount: 22.99,
      frequency: "Monthly",
      nextDueDate: "Apr 19, 2026",
      category: "Subscriptions",
      perPay: 11.5,
    },
  },
  {
    prompt: "School fees 4500 per term next one July 1",
    parsed: {
      name: "School Fees",
      amount: 4500,
      frequency: "Quarterly",
      nextDueDate: "Jul 1, 2026",
      category: "Education",
      perPay: 750,
    },
  },
  {
    prompt: "Electricity roughly 320 a quarter not sure when its due",
    parsed: {
      name: "Electricity",
      amount: 320,
      frequency: "Quarterly",
      nextDueDate: null,
      category: "Utilities",
      perPay: 53.33,
    },
  },
];

type FlowState = "input" | "thinking" | "confirm";

function SubmitBillButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <SubmitButton
      label="Add this commitment"
      pendingLabel="Adding…"
      disabled={disabled || pending}
    />
  );
}

function fieldClassName(extra?: string) {
  return cn(
    "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors focus:border-primary/50",
    extra,
  );
}

export function BillIntakeFlow({
  incomes,
  primaryIncomeId,
  categories,
}: {
  incomes: IncomeView[];
  primaryIncomeId: string;
  categories: Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }>;
}) {
  const [text, setText] = useState("");
  const [flowState, setFlowState] = useState<FlowState>("input");
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = text.trim().length > 5;

  const suggestions = useMemo(() => examples.map((example) => example.prompt), []);

  const selectedIncome = useMemo(() => {
    if (!draft) {
      return incomes.find((income) => income.id === primaryIncomeId) ?? incomes[0];
    }

    return incomes.find((income) => income.id === draft.fundedByIncomeId) ?? incomes[0];
  }, [draft, incomes, primaryIncomeId]);

  const perPayFromIncome = useMemo(() => {
    if (!draft || !selectedIncome) {
      return 0;
    }
    return calculatePerPayAmount(
      draft.amount,
      draft.frequency,
      selectedIncome.frequency,
    );
  }, [draft, selectedIncome]);

  const canSave =
    draft !== null &&
    draft.name.trim().length > 0 &&
    draft.amount > 0 &&
    Boolean(draft.nextDueDate);

  async function submit(description = text) {
    if (!description.trim()) {
      return;
    }

    setText(description);
    setErrorMessage(null);
    setFlowState("thinking");

    try {
      const response = await fetch("/api/parse-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      const payload = (await response.json()) as
        | { success: true; data: ParsedBillResponse }
        | { success: false; error: string };

      if (!payload.success) {
        throw new Error(payload.error);
      }

      const matchedCategory =
        categories.find((category) => category.name === payload.data.category) ??
        categories.find((category) => category.name.toLowerCase() === payload.data.category.toLowerCase()) ??
        categories.find((category) => category.name === "Other") ??
        categories[0];

      setDraft({
        name: payload.data.name,
        amount: payload.data.amount,
        frequency: payload.data.frequency,
        nextDueDate: payload.data.nextDueDate ?? "",
        categoryId: matchedCategory?.id ?? "",
        fundedByIncomeId: primaryIncomeId,
      });
      setFlowState("confirm");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to parse commitment.",
      );
      setFlowState("input");
    }
  }

  function reset() {
    setText("");
    setDraft(null);
    setFlowState("input");
  }

  return (
    <div className="space-y-6">
      {flowState === "input" ? (
        <>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Describe the commitment in your own words: how much, how often, and when it is due
            it&apos;s due - whatever you know.
          </p>

          <div className="relative">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder='e.g. "Car insurance $480 quarterly, due June 15"'
              className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-sm outline-none transition-colors focus:border-primary/50"
            />
            {canSubmit ? (
              <button
                type="button"
                onClick={() => submit()}
                className="absolute bottom-3 right-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Go
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {errorMessage}
            </div>
          ) : null}

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.5px] text-muted-foreground">
              Try one of these
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground"
                >
                  &quot;{suggestion}&quot;
                </button>
              ))}
            </div>
          </div>

          <SurfaceCard>
            <p className="text-sm text-muted-foreground">Prefer a form?</p>
            <Link
              href="/commitments/new/manual"
              className="mt-2 inline-block text-sm font-medium text-primary"
            >
              Enter details manually instead
            </Link>
          </SurfaceCard>
        </>
      ) : null}

      {flowState === "thinking" ? (
        <>
          <SurfaceCard>
            <p className="text-sm italic text-muted-foreground">&quot;{text}&quot;</p>
          </SurfaceCard>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
            <div>
              <p className="text-sm font-medium">Understanding your commitment...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Extracting amount, frequency, and due date
              </p>
            </div>
          </div>
        </>
      ) : null}

      {flowState === "confirm" && draft ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              ✓
            </div>
            <p className="text-sm font-medium">Here&apos;s what I got</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Adjust anything the model missed. Reserves use your current pay
            cadence ({sentenceCaseFrequency(selectedIncome?.frequency ?? "fortnightly")}).
          </p>

          <form action={createCommitmentAction} className="space-y-4">
            <SurfaceCard className="space-y-4">
              <label className="block space-y-2">
                <span className="text-xs text-muted-foreground">Funded from</span>
                <select
                  name="fundedByIncomeId"
                  value={draft.fundedByIncomeId}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, fundedByIncomeId: event.target.value }
                        : current,
                    )
                  }
                  className={fieldClassName()}
                >
                  {incomes.map((income) => (
                    <option key={income.id} value={income.id}>
                      {income.name} · {sentenceCaseFrequency(income.frequency)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs text-muted-foreground">Name</span>
                <input
                  name="name"
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className={fieldClassName()}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs text-muted-foreground">Amount (per occurrence)</span>
                <input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  value={Number.isFinite(draft.amount) ? draft.amount : 0}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            amount: Number.parseFloat(event.target.value) || 0,
                          }
                        : current,
                    )
                  }
                  className={cn(fieldClassName(), "font-mono")}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs text-muted-foreground">Frequency</span>
                <select
                  name="frequency"
                  value={draft.frequency}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            frequency: event.target.value as CommitmentFrequency,
                          }
                        : current,
                    )
                  }
                  className={fieldClassName()}
                >
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Next due</span>
                  {!draft.nextDueDate ? (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                      Required for reserves
                    </span>
                  ) : null}
                </span>
                <input
                  name="nextDueDate"
                  type="date"
                  required
                  value={draft.nextDueDate}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, nextDueDate: event.target.value }
                        : current,
                    )
                  }
                  className={cn(
                    fieldClassName(),
                    !draft.nextDueDate && "border-amber-500/40 bg-amber-500/5",
                  )}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs text-muted-foreground">Category</span>
                <select
                  name="categoryId"
                  value={draft.categoryId}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            categoryId: event.target.value,
                            subcategoryId: undefined,
                          }
                        : current,
                    )
                  }
                  className={fieldClassName()}
                >
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              {categories.find((c) => c.id === draft.categoryId)?.subcategories
                .length ? (
                <label className="block space-y-2">
                  <span className="text-xs text-muted-foreground">Subcategory (optional)</span>
                  <select
                    name="subcategoryId"
                    value={draft.subcategoryId ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              subcategoryId: event.target.value || undefined,
                            }
                          : current,
                      )
                    }
                    className={fieldClassName()}
                  >
                    <option value="">None</option>
                    {categories
                      .find((c) => c.id === draft.categoryId)!
                      .subcategories.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </SurfaceCard>

            {!draft.nextDueDate ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
                The model couldn&apos;t infer a due date. Pick the next payment
                date above so Keel can reserve the right amount before it hits.
              </div>
            ) : null}

            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-muted-foreground">
              Keel will reserve{" "}
              <span className="font-mono font-semibold text-primary">
                {formatAud(perPayFromIncome)}
              </span>{" "}
              from each {sentenceCaseFrequency(selectedIncome?.frequency ?? "fortnightly")} pay so this is covered
              when it&apos;s due.
            </div>

            <div className="space-y-3">
              <SubmitBillButton disabled={!canSave} />
              <button
                type="button"
                onClick={reset}
                className="w-full rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground"
              >
                Start over
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
