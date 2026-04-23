/**
 * Max-height tokens for {@link GlassSheet} sizes (shared with tests).
 *
 * @module components/keel/glass-sheet-layout
 */

export type GlassSheetSize = "compact" | "medium" | "tall";

export const GLASS_SHEET_MAX_HEIGHT: Record<GlassSheetSize, string> = {
  compact: "min(40vh, 360px)",
  medium: "min(60vh, 560px)",
  tall: "min(85vh, 860px)",
};
