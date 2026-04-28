/**
 * Theme bootstrapper: applies stored theme ASAP on the client.
 *
 * Implemented as an inline script to avoid a flash of incorrect theme on first paint.
 *
 * @module components/keel/theme-boot
 */

export function ThemeBootScript() {
  const code = `
(() => {
  const key = "keel-theme";
  const stored = localStorage.getItem(key);
  const theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark"); else root.classList.remove("dark");
  root.dataset.theme = resolved;
})();
  `.trim();

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

