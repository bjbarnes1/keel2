/**
 * Create goal form — posts via `createGoalAction`.
 *
 * @module app/goals/new/page
 */

import type { ReactNode } from "react";

import { createGoalAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

export default async function NewGoalPage() {
  const snapshot = await getDashboardSnapshot();

  const orderedIncomes = snapshot.incomes
    .slice()
    .sort((left, right) => {
      if (left.id === snapshot.primaryIncomeId) return -1;
      if (right.id === snapshot.primaryIncomeId) return 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <AppShell title="Add a goal" currentPath="/goals" backHref="/goals">
      <form action={createGoalAction} className="space-y-4">
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

        <Field label="What are you saving for?">
          <input
            name="name"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="e.g. Holiday fund"
          />
        </Field>

        <Field label="How much each pay?">
          <input
            name="contributionPerPay"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0.00"
          />
        </Field>

        <Field label="Do you have a target? (optional)">
          <input
            name="targetAmount"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="Leave blank for open-ended"
          />
        </Field>

        <Field label="By when? (optional)">
          <input
            name="targetDate"
            type="date"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <SurfaceCard className="bg-primary/10">
          <p className="text-sm text-muted-foreground">
            At <span className="font-mono text-primary">{formatAud(150)}</span> per
            fortnight, you&apos;ll reach{" "}
            <span className="font-mono text-primary">{formatAud(3000)}</span> in
            about 10 months.
          </p>
        </SurfaceCard>

        <SubmitButton label="Start saving" pendingLabel="Saving…" />
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
