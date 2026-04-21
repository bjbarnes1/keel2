/**
 * Root layout for the entire App Router tree.
 *
 * Server Component (default): wraps all routes, injects global CSS (`globals.css`
 * holds Tailwind v4 `@import`, design tokens `--keel-*`, and glass utilities).
 * Dark mode is fixed at the `<html>` level to match the product’s dark-first UI.
 *
 * @module app/layout
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Keel",
  description: "See what you actually have.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
