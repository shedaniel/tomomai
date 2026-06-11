import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tomomai/catalog", "@tomomai/server"],
  serverExternalPackages: ["pino", "sharp"],
  devIndicators: false,
};

export default nextConfig;
