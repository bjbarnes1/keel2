/**
 * Minimal theme manager (light/dark) without external dependencies.
 *
 * Stores user choice in `localStorage` and applies by toggling `documentElement.classList.dark`.
 * Default is "system" (prefers-color-scheme).
 *
 * @module lib/theme/theme
 */

export type KeelTheme = "light" | "dark" | "system";

const STORAGE_KEY = "keel-theme";

function systemPrefersDark() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): KeelTheme {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function resolveTheme(theme: KeelTheme): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

export function applyTheme(theme: KeelTheme) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
}

export function setTheme(theme: KeelTheme) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent("keel-theme-change"));
  }
  applyTheme(theme);
}

export function toggleTheme() {
  const current = getStoredTheme();
  const resolved = resolveTheme(current);
  setTheme(resolved === "dark" ? "light" : "dark");
}

export function subscribeThemeChange(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener("keel-theme-change", onCustom as EventListener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("keel-theme-change", onCustom as EventListener);
  };
}

