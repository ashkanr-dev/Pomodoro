import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what the container image runs. Vercel builds through
  // its own output pipeline, so leave it alone there.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
