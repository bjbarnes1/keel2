/**
 * Layer B — Learned Patterns (Zod schemas).
 *
 * Per-user behavioural observations derived **deterministically** from transaction
 * history. Never populated by an LLM — Layer B is statistics, not interpretation. The
 * analyser runs on a scheduled cadence; between runs, the row is intentionally stale
 * by up to a week (behaviour changes slowly; a week of lag is fine).
 *
 * When no row exists (new user, or analyser has not run yet) the loader returns the
 * frozen empty default below so the AI can honestly say "not enough history yet."
 *
 * @module lib/ai/context/schemas/layer-b-schema
 */

import { z } from "zod";

import { confidenceSchema } from "./confidence";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const isoDateTime = z.string().datetime();

export const categoryDriftSchema = z
  .object({
    categoryId: z.string().min(1),
    categoryName: z.string().min(1),
    budgetedMonthly: z.number().finite(),
    actualMonthlyAverage: z.number().finite(),
    driftPercent: z.number().finite(),
    confidence: confidenceSchema,
    monthsObserved: z.number().int().nonnegative(),
  })
  .strict();

export const seasonalVarianceSchema = z
  .object({
    categoryId: z.string().min(1),
    categoryName: z.string().min(1),
    highMonths: z.array(z.number().int().min(1).max(12)),
    highMonthMultiplier: z.number().finite(),
    lowMonths: z.array(z.number().int().min(1).max(12)),
    lowMonthMultiplier: z.number().finite(),
    confidence: confidenceSchema,
  })
  .strict();

export const cashflowTendenciesSchema = z
  .object({
    typicalEndOfCycleRemaining: z.number().finite(),
    variancePctOverLast6Cycles: z.number().finite().nonnegative(),
    skipCommitmentsPerQuarter: z.number().finite().nonnegative(),
    confidence: confidenceSchema,
  })
  .strict();

export const learnedPatternsSchema = z
  .object({
    categoryDrift: z.array(categoryDriftSchema),
    seasonalVariance: z.array(seasonalVarianceSchema),
    cashflowTendencies: cashflowTendenciesSchema,
    meta: z
      .object({
        totalTransactionsAnalyzed: z.number().int().nonnegative(),
        analysisVersion: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type LearnedPatterns = z.infer<typeof learnedPatternsSchema>;

export const layerBSchema = z
  .object({
    lastAnalyzedAt: isoDateTime.nullable(),
    analysisCoveringFrom: isoDate.nullable(),
    analysisCoveringTo: isoDate.nullable(),
    patterns: learnedPatternsSchema,
    /**
     * `true` when the loader returned the frozen empty default because no analyser row
     * exists yet. The Ask prompt branches on this to say "not enough history".
     */
    isEmpty: z.boolean(),
  })
  .strict();

export type LayerB = z.infer<typeof layerBSchema>;

/**
 * Frozen empty-pattern default — returned when a user has no `UserLearnedPatterns` row
 * or the analyser has not produced data yet. Uses low confidence everywhere so any
 * accidental citation is honest about the lack of history.
 */
export const EMPTY_LEARNED_PATTERNS: LearnedPatterns = Object.freeze({
  categoryDrift: [],
  seasonalVariance: [],
  cashflowTendencies: Object.freeze({
    typicalEndOfCycleRemaining: 0,
    variancePctOverLast6Cycles: 0,
    skipCommitmentsPerQuarter: 0,
    confidence: "low",
  }),
  meta: Object.freeze({
    totalTransactionsAnalyzed: 0,
    analysisVersion: "empty",
  }),
}) as LearnedPatterns;
