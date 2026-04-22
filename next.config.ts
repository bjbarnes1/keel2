/**
 * Next.js build/runtime configuration.
 *
 * Historical URL paths (`/bills`, `/incomes`, …) redirect to the current IA so
 * bookmarks and marketing links keep working after the Commitments / Settings rename.
 *
 * @module next.config
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_KEEL_ASK_AVAILABLE: process.env.ANTHROPIC_API_KEY?.trim() ? "1" : "0",
  },
  async redirects() {
    return [
      { source: "/bills", destination: "/commitments", permanent: false },
      { source: "/bills/new", destination: "/commitments/new", permanent: false },
      { source: "/bills/new/manual", destination: "/commitments/new/manual", permanent: false },
      { source: "/bills/:id/edit", destination: "/commitments/:id", permanent: false },
      { source: "/bills/:id", destination: "/commitments/:id", permanent: false },
      { source: "/settings/incomes", destination: "/incomes", permanent: false },
      { source: "/settings/incomes/new", destination: "/incomes/new", permanent: false },
      { source: "/settings/incomes/:id/edit", destination: "/incomes/:id/edit", permanent: false },
      { source: "/budget/members", destination: "/settings/household", permanent: false },
      { source: "/settings/wealth", destination: "/wealth", permanent: false },
      { source: "/settings/wealth/new", destination: "/wealth/new", permanent: false },
    ];
  },
};

export default nextConfig;
