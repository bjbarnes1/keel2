import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/incomes", destination: "/settings/incomes", permanent: false },
      { source: "/incomes/new", destination: "/settings/incomes/new", permanent: false },
      { source: "/budget/members", destination: "/settings/household", permanent: false },
    ];
  },
};

export default nextConfig;
