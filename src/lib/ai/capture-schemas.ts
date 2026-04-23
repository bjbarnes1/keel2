/**
 * Zod wire schemas for Capture / Ask structured payloads (no Anthropic, no DB).
 *
 * Kept separate from {@link module:lib/ai/parse-capture} so client components can
 * validate `?prefill=` JSON without pulling server-only dependencies.
 *
 * @module lib/ai/capture-schemas
 */

import { z } from "zod";

/**
 * Parsed bill / recurring commitment from Capture or Ask flows.
 *
 * - `amount`: currency per **billing cycle** (not annualized).
 * - `perPay`: money to set aside each primary pay period (fortnightly assumption when auto).
 * - `perPayAuto`: when true, `perPay` was derived; when false, user/model fixed it explicitly.
 */
export const commitmentCaptureSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  category: z.string().min(1),
  perPay: z.number().finite().nonnegative(),
  perPayAuto: z.boolean(),
});

export type CommitmentCapturePayload = z.infer<typeof commitmentCaptureSchema>;

/** Pay-cycle income: amount per pay; `nextPayDate` nullable when unknown. */
export const incomeCaptureSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  nextPayDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  isPrimary: z.boolean().optional(),
});

export type IncomeCapturePayload = z.infer<typeof incomeCaptureSchema>;

/**
 * Manual wealth holding row. Either `unitPrice × quantity` or `valueOverride` conveys total value.
 * `asOf` optional valuation date for snapshots.
 */
export const assetCaptureSchema = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1),
  symbol: z.string().min(1).nullable().optional(),
  quantity: z.number().finite().nonnegative(),
  unitPrice: z.number().finite().nonnegative().nullable().optional(),
  valueOverride: z.number().finite().nonnegative().nullable().optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type AssetCapturePayload = z.infer<typeof assetCaptureSchema>;
