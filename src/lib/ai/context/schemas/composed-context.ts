/**
 * Composed Context — the object passed to Sonnet on every Ask Keel request.
 *
 * Composes all three layers with a top-level version tag so a consumer can detect
 * schema drift and refuse to operate on a context shape it wasn't written for.
 *
 * @module lib/ai/context/schemas/composed-context
 */

import { z } from "zod";

import { layerASchema } from "./layer-a-schema";
import { layerBSchema } from "./layer-b-schema";
import { layerCSchema } from "./layer-c-schema";

/** Semver of the composed-context shape. Bump on breaking field changes. */
export const COMPOSED_CONTEXT_VERSION = "2026.04.v1";

export const composedContextSchema = z
  .object({
    version: z.literal(COMPOSED_CONTEXT_VERSION),
    generatedAt: z.string().datetime(),
    userContext: layerASchema,
    learnedPatterns: layerBSchema,
    structuralAssumptions: layerCSchema,
  })
  .strict();

export type ComposedContext = z.infer<typeof composedContextSchema>;
