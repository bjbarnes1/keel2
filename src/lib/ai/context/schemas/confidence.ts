/**
 * Shared confidence enum used across all layers of the AI context.
 *
 * Confidence is surfaced verbatim in long-horizon answers — "Assuming 2.9% annual
 * inflation (RBA target midpoint, **medium** confidence)". Keep the set small and stable;
 * adding levels forces an immediate audit of every layer's prompts.
 *
 * @module lib/ai/context/schemas/confidence
 */

import { z } from "zod";

export const confidenceSchema = z.enum(["high", "medium", "low", "very-low"]);
export type Confidence = z.infer<typeof confidenceSchema>;
