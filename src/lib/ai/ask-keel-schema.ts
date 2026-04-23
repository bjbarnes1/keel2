/**
 * Zod schema + TypeScript types for Ask Keel JSON responses (shared by API route and grounding).
 *
 * @module lib/ai/ask-keel-schema
 */

import { z } from "zod";

import {
  assetCaptureSchema,
  commitmentCaptureSchema,
  incomeCaptureSchema,
} from "@/lib/ai/capture-schemas";

const incomeSkipWireSchema = z.object({
  kind: z.literal("income"),
  incomeId: z.string().min(1),
  originalDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strategy: z.literal("STANDALONE"),
});

const chipSchema = z.union([
  z.string(),
  z.object({
    text: z.string().min(1),
    action: z.string().optional(),
  }),
]);

const citationSchema = z.object({
  /** Stable key from the snapshot allow-list (see `buildCitationRefAllowList`). */
  ref: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().finite().optional(),
  dateIso: z.string().optional(),
});

export const askResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal_projection"),
    headline: z.string().min(1),
    chart: z.object({
      months: z.array(z.string()).min(1),
      todayValue: z.number().finite(),
      targetValue: z.number().finite(),
      targetLabel: z.string().min(1),
    }),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("spending_summary"),
    headline: z.string().min(1),
    breakdown: z.array(z.object({ label: z.string().min(1), amount: z.number().finite() })).min(1),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("scenario_whatif"),
    headline: z.string().min(1),
    body: z.string().optional(),
    hypotheticalSkips: z
      .array(
        z.object({
          kind: z.literal("commitment"),
          commitmentId: z.string(),
          originalDateIso: z.string(),
          strategy: z.enum(["MAKE_UP_NEXT", "SPREAD", "MOVE_ON", "STANDALONE"]),
          spreadOverN: z.number().optional(),
        }),
      )
      .optional(),
    hypotheticalIncomeSkips: z.array(incomeSkipWireSchema).optional(),
    deltas: z.object({
      endProjectedAvailableMoney: z.number().finite(),
      endAvailableMoneyDelta: z.number().finite(),
      baselineEndProjectedAvailableMoney: z.number().finite().optional(),
    }),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("freeform"),
    headline: z.string().min(1),
    body: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    chips: z.array(chipSchema).optional(),
    citations: z.array(citationSchema).optional(),
    /** When true, UI may offer retry; set only by the API on validation failure. */
    answerValidationFailed: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("capture_redirect"),
    headline: z.string().min(1),
    sentence: z.string().min(1),
    capture: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("commitment"), payload: commitmentCaptureSchema }),
      z.object({ kind: z.literal("income"), payload: incomeCaptureSchema }),
      z.object({ kind: z.literal("asset"), payload: assetCaptureSchema }),
    ]),
  }),
]);

export type AskKeelResponse = z.infer<typeof askResponseSchema>;
