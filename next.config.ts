import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules it actually needs, which is what the container image runs.
  output: "standalone",
};

export default nextConfig;
