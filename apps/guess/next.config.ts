import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const APP_DIR = typeof __dirname !== "undefined" ? __dirname : process.cwd();
const WORKSPACE_ROOT = path.resolve(APP_DIR, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@tomomai/ui", "@tomomai/i18n", "@tomomai/catalog"],
  outputFileTracingRoot: WORKSPACE_ROOT,
  // Bundling rewrites the exported binary path to a non-existent `/ROOT/...`.
  serverExternalPackages: ["ffmpeg-static"],
  turbopack: {
    root: WORKSPACE_ROOT,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-select"],
  },
  devIndicators: false,
};

export default withNextIntl(nextConfig);
