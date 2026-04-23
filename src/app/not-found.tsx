/**
 * Global 404 page (App Router `not-found.tsx`).
 *
 * Standalone design per Plan 10 — intentionally avoids `AppShell` so the dead-end page
 * does not render a tab bar or header. Renders on the tide background with the Keel
 * wordmark at top and a single sea-green "Take me home" action.
 *
 * @module app/not-found
 */

import Link from "next/link";

export const metadata = {
  title: "Not found · Keel",
};

export default function NotFound() {
  return (
    <main
      role="main"
      className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--keel-tide)] px-6 py-12 text-[color:var(--keel-ink)]"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <p
          aria-label="Keel"
          className="text-[12px] font-medium uppercase tracking-[0.32em] text-[color:var(--keel-ink-4)]"
        >
          Keel
        </p>

        <h1 className="mt-6 text-[22px] font-medium leading-snug text-[color:var(--keel-ink)]">
          This page doesn&rsquo;t exist.
        </h1>

        <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">
          The link may be old, or the page may have moved.
        </p>

        <Link
          href="/"
          className="glass-tint-safe mt-8 inline-flex h-11 items-center justify-center rounded-full border border-[color:var(--keel-safe-soft)]/25 px-6 text-[13px] font-medium text-[color:var(--keel-safe-soft)] transition-colors hover:text-[color:var(--keel-ink)]"
        >
          Take me home
        </Link>
      </div>
    </main>
  );
}
