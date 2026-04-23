/**
 * Admin-gate check for Plan 11 context inspector.
 *
 * Admins are identified by an allow-list of Supabase user ids in the
 * `KEEL_ADMIN_USER_IDS` env var (comma-separated). This keeps admin access a deploy-time
 * decision, not a database-queryable value — appropriate for a tool that shows another
 * user's raw financial snapshot.
 *
 * **Security:**
 *   - Never assumes the middleware authenticated the request; every admin route does
 *     its own {@link createSupabaseServerClient} `.auth.getUser()` check.
 *   - When the env var is empty, the gate is *closed* (returns `null`). This is the
 *     safe default for production.
 *   - Returns a 404 (not 403) at the callsite when unauthorised, so the existence of
 *     the admin route is not leaked.
 *
 * @module lib/ai/context/admin-auth
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseAdminAllowList(): Set<string> {
  const raw = process.env.KEEL_ADMIN_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return new Set(ids);
}

/**
 * Returns the admin user when the request is authenticated and the caller's id is on
 * the `KEEL_ADMIN_USER_IDS` allow-list. Returns `null` otherwise — callers should
 * render `notFound()` to avoid leaking the existence of the admin surface.
 */
export async function getAdminUserOrNull(): Promise<{ id: string; email: string | null } | null> {
  const allowList = parseAdminAllowList();
  if (allowList.size === 0) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  if (!allowList.has(data.user.id)) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}
