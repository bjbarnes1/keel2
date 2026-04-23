/**
 * Layer C loader — reads, validates, and caches the structural-assumption JSON files.
 *
 * **Cache lifetime:** the validated Layer C is cached for the server process's lifetime.
 * Restarts pick up edits; for long-running servers, restart after editing any
 * `assumptions/*.json` file.
 *
 * **Staleness:** each file declares a `nextReviewDue` date. If any file is past due, the
 * loader logs a `console.warn` with the file name but does not throw — stale values are
 * still usable and blocking Ask Keel over an overdue review would be worse than the
 * slight inaccuracy.
 *
 * **Security:** the file paths are resolved relative to this module via `path.join`; user
 * input never influences which file is read. All three files pass through Zod before
 * reaching the composer, so a corrupt JSON file fails the request with a clear error.
 *
 * @module lib/ai/context/generators/load-layer-c
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { z } from "zod";

import {
  australianTaxSchema,
  economicAssumptionsSchema,
  layerCMetaSchema,
  layerCSchema,
  lifeStageSchema,
  type LayerC,
} from "../schemas/layer-c-schema";

const ASSUMPTIONS_DIR = path.join(process.cwd(), "src", "lib", "ai", "context", "assumptions");

type CachedLayerC = { at: number; value: LayerC };
let cache: CachedLayerC | null = null;

async function readAndValidate<S extends z.ZodTypeAny>(
  filename: string,
  schema: S,
): Promise<z.infer<S>> {
  const filePath = path.join(ASSUMPTIONS_DIR, filename);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `[layer-c] Failed to read ${filename}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[layer-c] ${filename} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`[layer-c] ${filename} failed schema validation: ${issues}`);
  }
  return validation.data as z.infer<S>;
}

/**
 * Emits a `console.warn` for any file whose `nextReviewDue` / `effectiveUntil` has
 * passed. Never throws — operations see the warning in logs without the request failing.
 */
function checkReviewDue(args: {
  meta: { nextReviewDue: string };
  economic: { nextReviewDue: string };
  tax: { effectiveUntil: string };
  todayIso: string;
}): void {
  const { meta, economic, tax, todayIso } = args;
  if (meta.nextReviewDue < todayIso) {
    console.warn(`[layer-c] meta.json review overdue (nextReviewDue=${meta.nextReviewDue}).`);
  }
  if (economic.nextReviewDue < todayIso) {
    console.warn(
      `[layer-c] economic.json review overdue (nextReviewDue=${economic.nextReviewDue}).`,
    );
  }
  if (tax.effectiveUntil < todayIso) {
    console.warn(
      `[layer-c] australian-tax.json appears expired (effectiveUntil=${tax.effectiveUntil}).`,
    );
  }
}

/**
 * Reads all Layer C files, validates their shapes, and returns a composed object.
 *
 * @param opts.force When `true`, bypasses the process-lifetime cache. Useful for tests
 *                   and the admin context inspector.
 */
export async function loadLayerC(opts: { force?: boolean } = {}): Promise<LayerC> {
  if (!opts.force && cache) return cache.value;

  const [economic, tax, lifeStage, meta] = await Promise.all([
    readAndValidate("economic.json", economicAssumptionsSchema),
    readAndValidate("australian-tax.json", australianTaxSchema),
    readAndValidate("life-stage.json", lifeStageSchema),
    readAndValidate("meta.json", layerCMetaSchema),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  checkReviewDue({ meta, economic, tax, todayIso });

  const composed: LayerC = {
    version: meta.version,
    lastComposed: new Date().toISOString(),
    economic,
    tax,
    lifeStage,
  };

  // Final shape check — belt-and-braces since the composed object is what callers receive.
  const finalValidation = layerCSchema.safeParse(composed);
  if (!finalValidation.success) {
    throw new Error(
      `[layer-c] composed object failed final validation: ${finalValidation.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  cache = { at: Date.now(), value: finalValidation.data };
  return finalValidation.data;
}

/** Test helper — clears the process-lifetime cache so each test sees a fresh read. */
export function __resetLayerCCacheForTests(): void {
  cache = null;
}
