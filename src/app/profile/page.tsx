import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function ProfilePage() {
  return (
    <AppShell title="Profile" currentPath="/profile" backHref="/">
      <SurfaceCard className="glass-clear">
        <p className="text-sm font-medium text-[color:var(--keel-ink)]">Your account</p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
          Profile details and preferences will live here. Nothing is missing from your budget — this screen is simply not built yet.
        </p>
      </SurfaceCard>
    </AppShell>
  );
}
