/**
 * Layer A — Observed Truth (Zod schemas).
 *
 * Rebuilt on every Ask Keel request from Prisma (with a 60-second per-user cache).
 * Payload target: ~2-4 KB serialized. Terse but human-readable field names so the Sonnet
 * prompt can cite values directly.
 *
 * Security: every field is a derivation of data the user owns (scoped by `budgetId` via
 * {@link getBudgetContext}) — this schema simply enforces shape and prevents rogue
 * top-level keys via `.strict()`.
 *
 * @module lib/ai/context/schemas/layer-a-schema
 */

import { z } from "zod";

// --- Primitive shapes --------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const isoDateTime = z.string().datetime();

const payFrequencySchema = z.enum(["weekly", "fortnightly", "monthly"]);
const commitmentFrequencySchema = z.enum([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
]);

// --- Entity summaries --------------------------------------------------------

export const layerAIncomeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.number().finite(),
    frequency: payFrequencySchema,
    nextPayDate: isoDate,
    isPrimary: z.boolean(),
  })
  .strict();

export const layerACommitmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.number().finite(),
    frequency: commitmentFrequencySchema,
    nextDueDate: isoDate,
    category: z.string().min(1),
    heldTowardNextDue: z.number().finite(),
    fundedByIncomeId: z.string().min(1).optional(),
  })
  .strict();

export const layerAGoalSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    contributionPerPay: z.number().finite(),
    currentBalance: z.number().finite(),
    targetAmount: z.number().finite().optional(),
    targetDate: isoDate.optional(),
    fundedByIncomeId: z.string().min(1).optional(),
  })
  .strict();

export const layerAUpcomingEventSchema = z
  .object({
    date: isoDate,
    type: z.enum(["income", "bill"]),
    name: z.string().min(1),
    amount: z.number().finite(),
    projectedAvailableMoney: z.number().finite(),
    isSkipped: z.boolean().optional(),
  })
  .strict();

export const layerAActiveSkipSchema = z
  .object({
    kind: z.enum(["commitment", "goal", "income"]),
    entityId: z.string().min(1),
    entityName: z.string().min(1),
    originalDate: isoDate,
    strategy: z.string().min(1),
  })
  .strict();

export const layerAWealthSchema = z
  .object({
    totalValue: z.number().finite(),
    accountCount: z.number().int().nonnegative(),
    holdingCount: z.number().int().nonnegative(),
    byAssetType: z
      .array(
        z
          .object({
            assetType: z.string().min(1),
            value: z.number().finite(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

// --- Top-level Layer A -------------------------------------------------------

export const layerASchema = z
  .object({
    asOf: isoDateTime,
    horizon: z
      .object({
        start: isoDate,
        end: isoDate,
        days: z.number().int().positive(),
      })
      .strict(),
    availableMoney: z
      .object({
        now: z.number().finite(),
        projectedMinOverHorizon: z.number().finite(),
        projectedMinDate: isoDate,
        projectedMaxOverHorizon: z.number().finite(),
        projectedMaxDate: isoDate,
        projectedAnnualEndBalance: z.number().finite(),
      })
      .strict(),
    annualTotals: z
      .object({
        income: z.number().finite(),
        commitments: z.number().finite(),
      })
      .strict(),
    incomes: z.array(layerAIncomeSchema),
    commitments: z.array(layerACommitmentSchema),
    goals: z.array(layerAGoalSchema),
    wealth: layerAWealthSchema,
    upcomingEvents: z.array(layerAUpcomingEventSchema),
    activeSkips: z.array(layerAActiveSkipSchema),
  })
  .strict();

export type LayerA = z.infer<typeof layerASchema>;
export type LayerAIncome = z.infer<typeof layerAIncomeSchema>;
export type LayerACommitment = z.infer<typeof layerACommitmentSchema>;
export type LayerAGoal = z.infer<typeof layerAGoalSchema>;
export type LayerAUpcomingEvent = z.infer<typeof layerAUpcomingEventSchema>;
export type LayerAActiveSkip = z.infer<typeof layerAActiveSkipSchema>;
