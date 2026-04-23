/**
 * Layer B loader — reads the authenticated user's `UserLearnedPatterns` row, validates
 * the JSON payload with Zod, and returns a typed `LayerB` object.
 *
 * When no row exists (new user, or analyser has not run yet) the loader returns the
 * frozen {@link EMPTY_LEARNED_PATTERNS} default with `isEmpty: true`. The Sonnet prompt
 * branches on that flag to say "I don't have enough history yet" for pattern questions.
 *
 * **Security:** scoped via {@link getBudgetContext} — never accepts a raw budgetId from
 * the caller. Demo-mode returns the empty default so `npm run dev` without a DB still
 * works.
 *
 * @module lib/ai/context/generators/load-layer-b
 */

import { getBudgetContext } from "@/lib/persistence/auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "@/lib/persistence/config";
import { getPrismaClient } from "@/lib/prisma";

import {
  EMPTY_LEARNED_PATTERNS,
  layerBSchema,
  learnedPatternsSchema,
  type LayerB,
} from "../schemas/layer-b-schema";

function emptyLayerB(): LayerB {
  return {
    lastAnalyzedAt: null,
    analysisCoveringFrom: null,
    analysisCoveringTo: null,
    patterns: EMPTY_LEARNED_PATTERNS,
    isEmpty: true,
  };
}

/**
 * Loads Layer B for the authenticated user. Returns the empty default shape if:
 *   - the database is not configured (local dev)
 *   - there is no `UserLearnedPatterns` row yet
 *   - the stored payload fails Zod validation (logged, then treated as missing)
 */
export async function loadLayerB(): Promise<LayerB> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return emptyLayerB();
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const row = await prisma.userLearnedPatterns.findUnique({
    where: { budgetId: budget.id },
  });

  if (!row) return emptyLayerB();

  const parsed = learnedPatternsSchema.safeParse(row.patterns);
  if (!parsed.success) {
    console.warn(
      `[layer-b] Stored patterns for budget ${budget.id} failed validation; returning empty. ` +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
    return emptyLayerB();
  }

  const layerB: LayerB = {
    lastAnalyzedAt: row.lastAnalyzedAt.toISOString(),
    analysisCoveringFrom: row.analysisCoveringFrom.toISOString().slice(0, 10),
    analysisCoveringTo: row.analysisCoveringTo.toISOString().slice(0, 10),
    patterns: parsed.data,
    isEmpty: false,
  };

  const validation = layerBSchema.safeParse(layerB);
  if (!validation.success) {
    console.warn(
      `[layer-b] Composed LayerB for budget ${budget.id} failed final validation; returning empty.`,
    );
    return emptyLayerB();
  }
  return validation.data;
}
