/**
 * Context Composer — orchestrates Layer A + Layer B + Layer C into a single object
 * passed to Sonnet (and later to the citation validator).
 *
 * Performance budget (steady-state):
 *   - Layer A: 50-200ms (Prisma read + projection build)
 *   - Layer B: ~5ms (one Prisma read, small JSON payload)
 *   - Layer C: ~1ms (in-memory cache after first load)
 * All three run in parallel. Expect composed-context generation under 250ms for a
 * typical user.
 *
 * Failure mode: if any layer throws, the error bubbles to the Ask Keel route handler,
 * which returns a user-facing fallback ("I'm having trouble accessing your data — try
 * again in a moment") rather than a raw error.
 *
 * @module lib/ai/context/generators/compose-context
 */

import {
  COMPOSED_CONTEXT_VERSION,
  composedContextSchema,
  type ComposedContext,
} from "../schemas/composed-context";

import { buildLayerA, invalidateLayerACache } from "./build-layer-a";
import { loadLayerB } from "./load-layer-b";
import { loadLayerC } from "./load-layer-c";

export { invalidateLayerACache };

/**
 * Builds the composed context for an authenticated user. Safe to call from any server
 * action or route handler that already has a valid Supabase user id.
 *
 * @param userId Supabase user id (cache key for Layer A; tenancy is enforced downstream).
 * @param asOf   Optional override for the "now" anchor. Defaults to the user's balanceAsOf.
 */
export async function composeAskContext(userId: string, asOf?: Date): Promise<ComposedContext> {
  const [userContext, learnedPatterns, structuralAssumptions] = await Promise.all([
    buildLayerA(userId, asOf),
    loadLayerB(),
    loadLayerC(),
  ]);

  const composed: ComposedContext = {
    version: COMPOSED_CONTEXT_VERSION,
    generatedAt: new Date().toISOString(),
    userContext,
    learnedPatterns,
    structuralAssumptions,
  };

  const validation = composedContextSchema.safeParse(composed);
  if (!validation.success) {
    throw new Error(
      `[compose-context] Final shape failed schema validation: ${validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return validation.data;
}
