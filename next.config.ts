import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/bills", destination: "/commitments", permanent: false },
      { source: "/bills/new", destination: "/commitments/new", permanent: false },
      { source: "/bills/new/manual", destination: "/commitments/new/manual", permanent: false },
      { source: "/bills/:id/edit", destination: "/commitments/:id", permanent: false },
      { source: "/bills/:id", destination: "/commitments/:id", permanent: false },
      { source: "/incomes", destination: "/settings/incomes", permanent: false },
      { source: "/incomes/new", destination: "/settings/incomes/new", permanent: false },
      { source: "/budget/members", destination: "/settings/household", permanent: false },
    ];
  },
};

export default nextConfig;
