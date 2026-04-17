import type { ReactNode } from "react";

import { createWealthHoldingAction } from "@/app/actions/keel-wealth";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function SettingsNewWealthPage() {
  return (
    <AppShell title="Add holding" currentPath="/settings" backHref="/settings/wealth">
      <form action={createWealthHoldingAction} className="space-y-4">
        <Field label="Asset type">
          <select
            name="assetType"
            defaultValue="CRYPTO"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          >
            <option value="STOCK">Shares / ETF</option>
            <option value="CRYPTO">Crypto</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>

        <Field label="Symbol (optional)">
          <input
            name="symbol"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="e.g. AAPL, VAS.AX, BTC"
          />
        </Field>

        <Field label="Name">
          <input
            name="name"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="e.g. Apple, Vanguard, Bitcoin"
          />
        </Field>

        <Field label="Quantity">
          <input
            name="quantity"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0"
          />
        </Field>

        <Field label="Unit price (optional)">
          <input
            name="unitPrice"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0.00"
          />
        </Field>

        <Field label="Or total value override (optional)">
          <input
            name="valueOverride"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono outline-none"
            placeholder="0.00"
          />
        </Field>

        <Field label="As of (optional)">
          <input
            name="asOf"
            type="date"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </Field>

        <SurfaceCard className="bg-primary/10">
          <p className="text-sm text-muted-foreground">
            If you set both, Keel will use the total value override.
          </p>
        </SurfaceCard>

        <button
          type="submit"
          className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white"
        >
          Add holding
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
