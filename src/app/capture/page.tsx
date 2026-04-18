import Link from "next/link";

import { CaptureKeelPanel } from "@/components/keel/capture-keel-panel";
import { AppShell } from "@/components/keel/primitives";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  return (
    <AppShell
      title="Capture"
      currentPath="/capture"
      headerRight={
        <Link
          href="/timeline"
          className="glass-clear inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink)]"
          aria-label="Close"
        >
          <span className="text-lg leading-none">×</span>
        </Link>
      }
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />
      <CaptureKeelPanel />
    </AppShell>
  );
}
