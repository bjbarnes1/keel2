/**
 * Tailwind CSS v4 still supports a JS config for theme extension.
 *
 * The canonical design tokens for surfaces/text live in `src/app/globals.css`
 * as CSS variables (`--keel-*`, `--radius-*`, glass presets). This file mirrors
 * a subset as Tailwind **color names** (`text-ink-3`, `bg-tide`, …) for utility
 * ergonomics where classes read better than arbitrary values.
 *
 * Prefer semantic tokens from globals when building new UI; use these aliases when
 * composing with standard Tailwind patterns.
 *
 * @module tailwind.config
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tide: { DEFAULT: "#0e1412", 2: "#141a17" },
        ink: {
          DEFAULT: "#f0ebdc",
          2: "#d4cfbf",
          3: "#a8ac9f",
          4: "#8a8f88",
          5: "#5f645e",
        },
        safe: {
          DEFAULT: "#6bb391",
          soft: "#8ec4a8",
          faint: "#a8c9b6",
        },
        attend: "#d48f46",
        btc: "#d4a55c",
        eth: "#9f97e8",
        stock: "#7fb5e8",
      },
      fontFamily: {
        sans: [
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        phone: "38px",
        xl: "38px",
        lg: "24px",
        md: "18px",
        sm: "14px",
        xs: "14px",
        xxs: "10px",
      },
      spacing: {
        "1.5": "6px",
        7: "28px",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.32, 0.72, 0, 1)",
        micro: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        150: "150ms",
        250: "250ms",
        350: "350ms",
        400: "400ms",
      },
    },
  },
};

export default config;
