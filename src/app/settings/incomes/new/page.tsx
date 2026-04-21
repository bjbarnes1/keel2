/**
 * Create income form (`createIncomeAction`).
 *
 * @module app/settings/incomes/new/page
 */

import type { ReactNode } from "react";

import { createIncomeAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";

export default function SettingsNewIncomePage() {
  return (
    <AppShell title="Add income" currentPath="/settings" backHref="/settings/incomes">
      <form action={createIncomeAction} className="space-y-4">
        <Field label="Name">
          <input
            name="name"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="e.g. Salary, Contract, Partner"
          />
        </Field>

        <Field label="Amount (per pay)">
          <input
            name="amount"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0.00"
          />
        </Field>

        <Field label="How often?">
          <select
            name="frequency"
            defaultValue="fortnightly"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>

        <Field label="Next payday">
          <input
            name="nextPayDate"
            type="date"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <SurfaceCard className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Make this primary</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Used as the default for new commitments and goals.
            </p>
          </div>
          <input
            name="isPrimary"
            type="checkbox"
            className="h-5 w-5 accent-primary"
          />
        </SurfaceCard>

        <SubmitButton label="Add income" pendingLabel="Adding…" />
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
