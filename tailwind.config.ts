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
          soft: "#a8d7bd",
          faint: "#a8c9b6",
        },
        attend: "#d4a55c",
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
        xl: "24px",
        lg: "20px",
        md: "18px",
        sm: "16px",
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
