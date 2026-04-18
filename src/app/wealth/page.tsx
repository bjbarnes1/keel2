import { AppShell } from "@/components/keel/primitives";

export const dynamic = "force-dynamic";

export default function WealthPage() {
  return (
    <AppShell title="Wealth" currentPath="/wealth">
      <div className="glass-clear flex min-h-[calc(100vh-220px)] flex-col items-center justify-center rounded-[var(--radius-xl)] px-6 py-16 text-center">
        <p className="text-[22px] font-medium text-[color:var(--keel-ink-2)]">Coming soon</p>
        <p className="mt-3 max-w-[32ch] text-sm leading-6 text-[color:var(--keel-ink-3)]">
          Wealth will connect your holdings, balances, and long-horizon context in one calm surface.
        </p>
      </div>
    </AppShell>
  );
}
