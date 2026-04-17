import type { ReactNode } from "react";

import { createCommitmentAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getCategoryOptions, getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { sentenceCaseFrequency } from "@/lib/utils";
import { formatAud } from "@/lib/utils";

export default async function ManualBillPage() {
  const snapshot = await getDashboardSnapshot();
  const categories = await getCategoryOptions();

  const orderedIncomes = snapshot.incomes
    .slice()
    .sort((left, right) => {
      if (left.id === snapshot.primaryIncomeId) return -1;
      if (right.id === snapshot.primaryIncomeId) return 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <AppShell title="Add a bill" currentPath="/bills" backHref="/bills/new">
      <form action={createCommitmentAction} className="space-y-4">
        <Field label="Funded from">
          <select
            name="fundedByIncomeId"
            defaultValue={snapshot.primaryIncomeId}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            {orderedIncomes.map((income) => (
              <option key={income.id} value={income.id}>
                {income.name} · {sentenceCaseFrequency(income.frequency)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What's the bill?">
          <input
            name="name"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="e.g. Car Insurance"
          />
        </Field>

        <Field label="How much?">
          <input
            name="amount"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0.00"
          />
        </Field>

        <Field label="How often?">
          <select
            name="frequency"
            defaultValue="monthly"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </Field>

        <Field label="When's the next one due?">
          <input
            name="nextDueDate"
            type="date"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <Field label="Category (optional)">
          <select
            name="categoryId"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>

        <SurfaceCard className="bg-primary/10">
          <p className="text-sm text-muted-foreground">
            Keel will reserve{" "}
            <span className="font-mono font-semibold text-primary">
              {formatAud(80)}
            </span>{" "}
            per fortnight for this.
          </p>
        </SurfaceCard>

        <button
          type="submit"
          className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white"
        >
          Add this bill
        </button>
      </form>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
