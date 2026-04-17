import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { updateIncomeFutureAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getIncomeForEdit } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SettingsEditIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const income = await getIncomeForEdit(id);

  if (!income) {
    notFound();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell title="Edit income" currentPath="/settings" backHref="/settings/incomes">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Changes create a new version from the date you pick. Keel keeps using your current pay details until
          then, and does not rewrite how past dates were calculated.
        </p>
      </SurfaceCard>

      <form action={updateIncomeFutureAction} className="space-y-4">
        <input type="hidden" name="incomeId" value={income.id} />

        <Field label="Applies from (UTC date)">
          <input
            name="effectiveFrom"
            type="date"
            required
            min={today}
            defaultValue={today}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <Field label="Name">
          <input
            name="name"
            required
            defaultValue={income.name}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <Field label="Amount (per pay)">
          <input
            name="amount"
            required
            defaultValue={String(income.amount)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
          />
        </Field>

        <Field label="How often?">
          <select
            name="frequency"
            defaultValue={income.frequency}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>

        <Field label="Next payday (for the new version)">
          <input
            name="nextPayDate"
            type="date"
            required
            defaultValue={income.nextPayDate}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        {income.isPrimary ? (
          <p className="text-xs text-muted-foreground">This is your primary income.</p>
        ) : null}

        <button
          type="submit"
          className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white"
        >
          Save future change
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
