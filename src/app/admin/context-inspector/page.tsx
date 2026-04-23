/**
 * Admin — AI Context Inspector.
 *
 * Shows the composed `ComposedContext` for the signed-in admin. Used for debugging
 * grounded answers: if a user reports an incorrect Ask response, the admin opens this
 * page to see exactly what context Sonnet was given.
 *
 * **Access control:** gated by {@link getAdminUserOrNull} — when the caller is not on
 * the allow-list, the page renders a 404 via `notFound()` so the existence of the
 * admin surface is not leaked.
 *
 * @module app/admin/context-inspector/page
 */

import { notFound } from "next/navigation";

import { composeAskContext } from "@/lib/ai/context/generators/compose-context";
import { getAdminUserOrNull } from "@/lib/ai/context/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Context inspector · Keel admin",
  robots: { index: false, follow: false },
};

export default async function ContextInspectorPage() {
  const admin = await getAdminUserOrNull();
  if (!admin) notFound();

  let payload: unknown;
  let error: string | null = null;
  try {
    payload = await composeAskContext(admin.id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const pretty = payload ? JSON.stringify(payload, null, 2) : "";

  return (
    <main className="min-h-screen bg-[color:var(--keel-tide)] p-6 text-[color:var(--keel-ink)]">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--keel-ink-4)]">
            Keel Admin
          </p>
          <h1 className="mt-2 text-2xl font-medium">AI Context Inspector</h1>
          <p className="mt-2 text-sm text-[color:var(--keel-ink-3)]">
            Composed three-layer context for <span className="font-mono">{admin.email ?? admin.id}</span>.
            Refresh invalidates Layer A cache on the next request.
          </p>
        </header>

        {error ? (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--keel-attend)]/40 bg-[color:var(--keel-attend)]/10 p-4 text-sm text-[color:var(--keel-ink-2)]">
            <p className="font-medium">Failed to compose context</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[color:var(--keel-ink-3)]">
              {error}
            </pre>
          </div>
        ) : (
          <pre className="glass-clear overflow-x-auto rounded-[var(--radius-md)] border border-white/10 p-4 text-[11px] leading-relaxed text-[color:var(--keel-ink-2)]">
            {pretty}
          </pre>
        )}
      </div>
    </main>
  );
}
