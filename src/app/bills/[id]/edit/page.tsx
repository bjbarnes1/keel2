import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  deleteCommitmentAction,
  updateCommitmentAction,
} from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import {
  getCommitmentForEdit,
  getCategoryOptions,
  getDashboardSnapshot,
} from "@/lib/persistence/keel-store";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const commitment = await getCommitmentForEdit(id);
  const snapshot = await getDashboardSnapshot();
  const categories = await getCategoryOptions();
  const displayCommitment = snapshot.commitments.find(
    (candidate) => candidate.id === id,
  );

  if (!commitment || !displayCommitment) {
    notFound();
  }

  const reservedPercent = Math.min(
    Math.round((displayCommitment.reserved / displayCommitment.amount) * 100),
    100,
  );

  const orderedIncomes = snapshot.incomes
    .slice()
    .sort((left, right) => {
      if (left.id === snapshot.primaryIncomeId) return -1;
      if (right.id === snapshot.primaryIncomeId) return 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <AppShell title={commitment.name} currentPath="/bills" backHref="/bills">
      <SurfaceCard>
        <p className="font-mono text-lg font-semibold text-amber-500">
          {formatAud(displayCommitment.reserved)} of {formatAud(displayCommitment.amount)} reserved
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{reservedPercent}% funded · Due {displayCommitment.nextDueDate}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-amber-500" style={{ width: `${reservedPercent}%` }} />
        </div>
      </SurfaceCard>

      <form action={updateCommitmentAction.bind(null, id)} className="mt-6 space-y-4">
        <Field label="Applies from (UTC date)">
          <input
            name="effectiveFrom"
            type="date"
            required
            min={new Date().toISOString().slice(0, 10)}
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <Field label="Funded from">
          <select
            name="fundedByIncomeId"
            defaultValue={commitment.fundedByIncomeId ?? snapshot.primaryIncomeId}
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
            defaultValue={commitment.name}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>
        <Field label="How much?">
          <input
            name="amount"
            defaultValue={commitment.amount}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
          />
        </Field>
        <Field label="How often?">
          <select
            name="frequency"
            defaultValue={commitment.frequency}
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
            defaultValue={commitment.nextDueDate}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>
        <Field label="Category">
          <select
            name="categoryId"
            defaultValue={commitment.categoryId}
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
            Current per-pay reservation:{" "}
            <span className="font-mono font-semibold text-primary">
              {formatAud(displayCommitment.perPay)}
            </span>
          </p>
        </SurfaceCard>

        <div className="space-y-3">
          <SubmitButton label="Save changes" pendingLabel="Saving…" />
        </div>
      </form>

      <form action={deleteCommitmentAction.bind(null, id)} className="mt-6">
        <SubmitButton
          label="Remove this bill"
          pendingLabel="Removing…"
          variant="outline"
          className="border-red-500/30 text-red-500 hover:text-red-500"
        />
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
