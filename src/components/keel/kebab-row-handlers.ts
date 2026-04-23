/**
 * Pure helpers for {@link KebabRow} keyboard handling (unit-testable without DOM).
 *
 * @module components/keel/kebab-row-handlers
 */

/** Returns true when Enter or Space should activate a control (not repeat). */
export function isActivationKey(e: { key: string; repeat?: boolean }): boolean {
  if (e.repeat) return false;
  return e.key === "Enter" || e.key === " ";
}
