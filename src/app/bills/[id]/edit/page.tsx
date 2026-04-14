import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  deleteCommitmentAction,
  updateCommitmentAction,
} from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import {
  getCommitmentForEdit,
  getDashboardSnapshot,
} from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const commitment = await getCommitmentForEdit(id);
  const snapshot = await getDashboardSnapshot();
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
            defaultValue={commitment.nextDueDate}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>
        <Field label="Category">
          <select
            name="category"
            defaultValue={commitment.category}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            {["Housing", "Insurance", "Utilities", "Subscriptions", "Transport", "Education", "Health", "Other"].map((option) => (
              <option key={option}>{option}</option>
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
          <button
            type="submit"
            className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white"
          >
            Save changes
          </button>
        </div>
      </form>

      <form action={deleteCommitmentAction.bind(null, id)} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-2xl border border-red-500/30 px-4 py-4 text-sm text-red-500"
        >
          Remove this bill
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
