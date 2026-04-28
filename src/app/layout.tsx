/**
 * Root layout for the entire App Router tree.
 *
 * Server Component (default): wraps all routes, injects global CSS (`globals.css`
 * holds Tailwind v4 `@import`, design tokens `--keel-*`, and glass utilities).
 * Dark mode is fixed at the `<html>` level to match the product’s dark-first UI.
 *
 * **Metadata:** `metadataBase` uses `NEXT_PUBLIC_SITE_URL` when set (production URL
 * for Open Graph); otherwise localhost for dev. `themeColor` is exported via
 * `viewport` per Next.js 16 guidance.
 *
 * @module app/layout
 */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";

import { GlassSheetScopeProvider } from "@/components/keel/glass-sheet-scope";
import { ThemeBootScript } from "@/components/keel/theme-boot";

const siteName = "Keel";
const description =
  "See what you actually have — commitments, goals, and cashflow grounded in your balance and pay cycle.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: siteName,
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description,
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName,
    title: siteName,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1412",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeBootScript />
        <GlassSheetScopeProvider>{children}</GlassSheetScopeProvider>
      </body>
    </html>
  );
}
