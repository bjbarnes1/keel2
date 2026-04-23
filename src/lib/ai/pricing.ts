/**
 * Rough Anthropic token → AUD cent estimates for cost ceilings.
 *
 * Uses published USD per-million-token hints and a fixed AUD multiplier; tune via env
 * if pricing changes. Intended for abuse caps, not billing-grade accuracy.
 *
 * @module lib/ai/pricing
 */

const DEFAULT_AUD_PER_USD = Number(process.env.KEEL_AI_AUD_PER_USD ?? "1.55");

type ModelRates = { inputUsdPerMtok: number; outputUsdPerMtok: number };

const MODEL_RATES: Record<string, ModelRates> = {
  "claude-haiku-4-5-20251001": { inputUsdPerMtok: 0.8, outputUsdPerMtok: 4.0 },
  "claude-sonnet-4-6": { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 },
  // Legacy aliases kept so cost rows written before the model migration still resolve.
  "claude-3-5-haiku-20241022": { inputUsdPerMtok: 0.25, outputUsdPerMtok: 1.25 },
  "claude-sonnet-4-20250514": { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 },
};

function ratesForModel(model: string): ModelRates {
  return MODEL_RATES[model] ?? { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 };
}

/**
 * Estimates spend in **AUD cents** from token usage (ceiling-friendly, rounded up).
 */
export function estimateAnthropicCostCentsAud(model: string, inputTokens: number, outputTokens: number): number {
  const r = ratesForModel(model);
  const usd = (inputTokens / 1_000_000) * r.inputUsdPerMtok + (outputTokens / 1_000_000) * r.outputUsdPerMtok;
  const aud = usd * DEFAULT_AUD_PER_USD;
  return Math.max(0, Math.ceil(aud * 100));
}
