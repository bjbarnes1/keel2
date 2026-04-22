/**
 * Static help / feedback placeholder.
 *
 * @module app/help/page
 */

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function HelpPage() {
  return (
    <AppShell title="Help & feedback" currentPath="/help" backHref="/">
      <SurfaceCard className="glass-clear">
        <p className="text-sm font-medium text-[color:var(--keel-ink)]">We are listening</p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
          Guides and support channels will show up here. When Ask Keel is enabled for your environment, use it from the tab bar for quick questions about your numbers.
        </p>
      </SurfaceCard>
    </AppShell>
  );
}
