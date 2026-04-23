/**
 * Layer C — Structural Assumptions (Zod schemas).
 *
 * Every field on every Layer C file has a `confidence` attached. The shape is enforced
 * both on read (so a badly-edited JSON file fails loudly at server start) and is surfaced
 * to the LLM prompt. Confidence levels are authoritative: the AI must cite them for any
 * long-horizon claim that leans on Layer C.
 *
 * @module lib/ai/context/schemas/layer-c-schema
 */

import { z } from "zod";

import { confidenceSchema } from "./confidence";

// --- ISO date helpers --------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// --- economic.json -----------------------------------------------------------

export const economicAssumptionsSchema = z
  .object({
    version: z.string().min(1),
    lastReviewed: isoDate,
    reviewIntervalDays: z.number().int().positive(),
    nextReviewDue: isoDate,
    cpi: z.object({
      currentAnnualRate: z.number().finite(),
      rbaTarget: z.tuple([z.number().finite(), z.number().finite()]),
      fiveYearAssumption: z.number().finite(),
      tenYearAssumption: z.number().finite(),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
    wageGrowth: z.object({
      currentAnnualRate: z.number().finite(),
      fiveYearAssumption: z.number().finite(),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
    interestRates: z.object({
      cashRateCurrent: z.number().finite(),
      mortgageRateCurrent: z.number().finite(),
      mortgageRateFiveYearAssumption: z.number().finite(),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
    assetReturns: z.object({
      asx200LongRunAnnualNominal: z.number().finite(),
      asx200LongRunAnnualReal: z.number().finite(),
      cashSavingsAnnual: z.number().finite(),
      bitcoinVolatilityNote: z.string().min(1),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
    propertyAssumptions: z.object({
      nationalFiveYearGrowthAssumption: z.number().finite(),
      propertyGrowthNote: z.string().min(1),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
  })
  .strict();

export type EconomicAssumptions = z.infer<typeof economicAssumptionsSchema>;

// --- australian-tax.json -----------------------------------------------------

export const taxBracketSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().positive().nullable(),
    rate: z.number().min(0).max(1),
    offset: z.number().int().nonnegative(),
  })
  .strict();

export const hecsThresholdSchema = z
  .object({
    from: z.number().int().nonnegative(),
    rate: z.number().min(0).max(1),
  })
  .strict();

export const australianTaxSchema = z
  .object({
    version: z.string().min(1),
    effectiveFrom: isoDate,
    effectiveUntil: isoDate,
    individualIncomeTaxBrackets: z.array(taxBracketSchema).min(1),
    medicareLevyRate: z.number().min(0).max(1),
    medicareLevySurchargeThresholds: z.object({
      singleBase: z.number().int().positive(),
      familyBase: z.number().int().positive(),
      note: z.string().min(1),
    }),
    superGuaranteeRate: z.number().min(0).max(1),
    superContributionCaps: z.object({
      concessionalAnnual: z.number().int().positive(),
      nonConcessionalAnnual: z.number().int().positive(),
    }),
    hecsRepaymentThresholds: z.array(hecsThresholdSchema).min(1),
    source: z.string().min(1),
    lastReviewed: isoDate,
    confidence: confidenceSchema,
  })
  .strict();

export type AustralianTax = z.infer<typeof australianTaxSchema>;

// --- life-stage.json ---------------------------------------------------------

export const lifeStageSchema = z
  .object({
    version: z.string().min(1),
    lastReviewed: isoDate,
    childCosts: z.object({
      childcarePerChildAnnualAverage: z.number().int().nonnegative(),
      childcareEndsAtAge: z.number().int().nonnegative(),
      schoolAgeAdditionalAnnual: z.number().int().nonnegative(),
      teenAgeAdditionalAnnual: z.number().int().nonnegative(),
      note: z.string().min(1),
      confidence: confidenceSchema,
    }),
    retirement: z.object({
      comfortableRetirementCoupleAnnual: z.number().int().positive(),
      modestRetirementCoupleAnnual: z.number().int().positive(),
      comfortableRetirementSingleAnnual: z.number().int().positive(),
      modestRetirementSingleAnnual: z.number().int().positive(),
      source: z.string().min(1),
      confidence: confidenceSchema,
    }),
    generalLifeCostShifts: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type LifeStage = z.infer<typeof lifeStageSchema>;

// --- meta.json ---------------------------------------------------------------

export const layerCMetaSchema = z
  .object({
    version: z.string().min(1),
    composition: z.object({
      economic: z.string().min(1),
      australianTax: z.string().min(1),
      lifeStage: z.string().min(1),
    }),
    lastReviewed: isoDate,
    reviewIntervalDays: z.number().int().positive(),
    nextReviewDue: isoDate,
    maintainerNote: z.string().min(1),
  })
  .strict();

export type LayerCMeta = z.infer<typeof layerCMetaSchema>;

// --- Composed Layer C --------------------------------------------------------

/**
 * The fully-loaded Layer C object handed to the context composer.
 *
 * `lastComposed` is stamped by the loader at read time (not from a JSON field) so stale
 * file-system caches can be detected.
 */
export const layerCSchema = z
  .object({
    version: z.string().min(1),
    lastComposed: z.string().datetime(),
    economic: economicAssumptionsSchema,
    tax: australianTaxSchema,
    lifeStage: lifeStageSchema,
  })
  .strict();

export type LayerC = z.infer<typeof layerCSchema>;
