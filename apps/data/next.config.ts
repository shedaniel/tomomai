import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tomomai/catalog"],
  serverExternalPackages: ["pino", "sharp"],
  devIndicators: false,
};

export default nextConfig;
