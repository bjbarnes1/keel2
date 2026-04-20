/**
 * Haptic feedback for the Waterline scrub.
 *
 * All calls are feature-detected against `navigator.vibrate` and rate-limited
 * to one buzz per HAPTIC_RATE_LIMIT_MS regardless of how many events are
 * crossed in a single frame (fast swipes past dense commitments would
 * otherwise produce a buzz-storm).
 *
 * On desktop / browsers without Vibration API support every function is a
 * safe no-op.
 */

/** Minimum spacing between successive haptics. */
export const HAPTIC_RATE_LIMIT_MS = 80;

let lastBuzzAt = 0;

function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}

function fireIfReady(durationMs: number): void {
  if (!canVibrate()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastBuzzAt < HAPTIC_RATE_LIMIT_MS) return;
  lastBuzzAt = now;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // some browsers gate vibrate behind a user-gesture; swallow rejection
  }
}

/** Lighter, brighter tap: the focal line crossed an incoming pay event. */
export function hapticPayCrossing(): void {
  fireIfReady(10);
}

/** Softer tap: the focal line crossed a commitment anchor. */
export function hapticCommitmentCrossing(): void {
  fireIfReady(5);
}

/** Test-only helper so suites can assert rate-limit behavior without races. */
export function __resetHapticRateLimitForTests(): void {
  lastBuzzAt = 0;
}
