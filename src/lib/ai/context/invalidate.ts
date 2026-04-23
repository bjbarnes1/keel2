/**
 * Cache invalidation entry point for Plan 11 AI context layers.
 *
 * Layer A is cached per-user for 60 seconds to cut the cost of follow-up questions in a
 * single Ask session. Any write action that mutates the user's financial state should
 * call {@link invalidateAskContextForCurrentUser} at the tail of the mutation so the
 * next Ask request reads the fresh data.
 *
 * The 60-second TTL is a safety rail — if a write path forgets to invalidate, the
 * context is at most 60s stale. Invalidation is the correctness guarantee; the TTL is
 * the fallback.
 *
 * **Security:** resolves the caller's Supabase user from the existing
 * {@link getAuthedUser} helper rather than accepting a userId argument — this prevents
 * any call site from invalidating another user's cache by mistake.
 *
 * @module lib/ai/context/invalidate
 */

import { getAuthedUser } from "@/lib/persistence/auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "@/lib/persistence/config";

import { invalidateLayerACache } from "./generators/build-layer-a";

/**
 * Evicts the Layer A cache entry for the currently-authenticated user. Call at the end
 * of any server action that has written user-owned data (commitment, income, goal, skip,
 * bank balance, transaction).
 *
 * Safe to call in demo / local-dev mode — it short-circuits when auth is not configured.
 * Never throws; failure to invalidate falls back to the 60-second TTL.
 */
export async function invalidateAskContextForCurrentUser(): Promise<void> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return;
  try {
    const user = await getAuthedUser();
    invalidateLayerACache(user.id);
  } catch (err) {
    // Write has already succeeded; a missed cache bust is recoverable via TTL.
    console.warn(
      "[ai-context] invalidateAskContextForCurrentUser failed (TTL will catch stale data):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
