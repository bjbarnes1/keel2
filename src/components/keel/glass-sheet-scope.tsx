"use client";

/**
 * Tracks how many {@link GlassSheet} instances are open so consumers (e.g. FAB)
 * can hide chrome while a sheet is presented.
 *
 * @module components/keel/glass-sheet-scope
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type GlassSheetScopeValue = {
  openCount: number;
  /** Add positive to register open, negative when closing (e.g. -1). */
  adjustOpenCount: (delta: number) => void;
};

const GlassSheetScopeContext = createContext<GlassSheetScopeValue | null>(null);

export function GlassSheetScopeProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const adjustOpenCount = useCallback((delta: number) => {
    setOpenCount((c) => Math.max(0, c + delta));
  }, []);
  const value = useMemo(
    () => ({
      openCount,
      adjustOpenCount,
    }),
    [openCount, adjustOpenCount],
  );
  return <GlassSheetScopeContext.Provider value={value}>{children}</GlassSheetScopeContext.Provider>;
}

export function useGlassSheetOpenCount() {
  const ctx = useContext(GlassSheetScopeContext);
  return ctx?.openCount ?? 0;
}

/** Call from GlassSheet when the sheet is visibly open (after mount). */
export function useRegisterGlassSheetOpen(isOpen: boolean) {
  const ctx = useContext(GlassSheetScopeContext);
  useEffect(() => {
    if (!ctx || !isOpen) return;
    ctx.adjustOpenCount(1);
    return () => ctx.adjustOpenCount(-1);
  }, [ctx, isOpen]);
}

/** True when at least one sheet in the scope has registered as open. */
export function useAnyGlassSheetOpen() {
  return useGlassSheetOpenCount() > 0;
}
