/**
 * CoinGecko simple price for BTC in AUD with a short in-memory cache (≈5 minutes).
 *
 * @module lib/market/coingecko-btc
 */

const URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=aud&precision=2";

type Cache = { fetchedAt: number; aud: number };
let cache: Cache | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getBtcAudPrice(): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.aud;
  }

  try {
    const res = await fetch(URL, { next: { revalidate: 300 } });
    if (!res.ok) return cache?.aud ?? null;
    const body = (await res.json()) as { bitcoin?: { aud?: number } };
    const aud = body.bitcoin?.aud;
    if (typeof aud !== "number" || !Number.isFinite(aud)) return cache?.aud ?? null;
    cache = { fetchedAt: now, aud };
    return aud;
  } catch {
    return cache?.aud ?? null;
  }
}
