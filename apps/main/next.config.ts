import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withVercelToolbar as withVercelToolbarPlugin } from "@vercel/toolbar/plugins/next";
import withBundleAnalyzer from '@next/bundle-analyzer';
import { execSync } from "node:child_process";
import fs from "node:fs";
import matter from "gray-matter";
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

// Third-party origins the app talks to unconditionally. Everything else is
// derived from env so hosts are never duplicated between config and deploy.
const CLOUDFLARE_TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const OPENFREEMAP_ORIGIN = 'https://tiles.openfreemap.org';

// headers() runs at build time, so these must be set in the build environment,
// not only at runtime — a missing value silently drops the origin from the CSP.
function assetOrigin(name: string): string | null {
  const origin = configuredOrigin(process.env[name]);
  if (!origin && process.env.NODE_ENV === 'production') {
    console.warn(`[csp] ${name} is unset at build time; its origin will be omitted from the CSP`);
  }
  return origin;
}

function buildContentSecurityPolicy(): string {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const renderOrigin = assetOrigin('RENDER_PUBLIC_URL');
  const imageOrigins = [...new Set([
    assetOrigin('NEXT_PUBLIC_R2_URL'),
    assetOrigin('NEXT_PUBLIC_R2_URL_CN'),
    renderOrigin,
    OPENFREEMAP_ORIGIN,
  ].filter((origin): origin is string => origin !== null))];
  const connectOrigins = [
    "'self'",
    CLOUDFLARE_TURNSTILE_ORIGIN,
    OPENFREEMAP_ORIGIN,
    ...(renderOrigin ? [renderOrigin] : []),
    ...(isDevelopment
      ? ['http://localhost:*', 'https://localhost:*', 'ws://localhost:*', 'wss://localhost:*']
      : []),
  ];

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} ${CLOUDFLARE_TURNSTILE_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${imageOrigins.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectOrigins.join(' ')}`,
    "worker-src 'self' blob:",
    `frame-src ${CLOUDFLARE_TURNSTILE_ORIGIN} https://www.youtube-nocookie.com https://player.bilibili.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

// Rolling-release build identity, frozen at build time and inlined via `env`
// below (git is not available at serverless runtime). BUILD_STAMP is the HEAD
// commit time (MMDDHHMM) — auto-bumps per build, shallow-clone-safe, and
// reproducible for rebuilds of the same commit. See docs / changelog versions.
const git = (cmd: string, fallback = "dev") => {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return fallback; }
};
const BUILD_STAMP = git("git show -s --format=%cd --date=format:%m%d%H%M HEAD");
const GIT_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD", "")).slice(0, 7) || "dev";

// The rolling version minor ("dev of next") derived from the latest changelog
// post. Changelog posts are recaps of the just-finished cycle, so once the
// `2026.5` post is published we are already working toward `2026.6`; minors
// track months and roll the year over in December. Frozen at build time and
// inlined via `env` so SiteFooter (in RootLayout) never re-reads post files
// from disk on every server render. See src/lib/version.ts and docs.
const APP_VERSION_MINOR = (() => {
  const nextDevVersion = (latest: string) => {
    const [year, minor] = latest.split(".").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(minor)) return latest;
    return minor >= 12 ? `${year + 1}.1` : `${year}.${minor + 1}`;
  };
  try {
    const dir = path.join(process.cwd(), "content/posts");
    const latest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".en.mdx"))
      .map((f) => matter(fs.readFileSync(path.join(dir, f), "utf-8")).data as {
        date?: string;
        version?: string;
      })
      .filter((d) => d.version && d.version !== "N/A")
      .sort((a, b) => ((a.date ?? "") > (b.date ?? "") ? -1 : 1))[0]?.version;
    return latest ? nextDevVersion(latest) : "0.0";
  } catch {
    return "0.0";
  }
})();

const nextConfig: NextConfig = {
  transpilePackages: ["@tomomai/ui", "@tomomai/i18n", "@tomomai/markdown"],
  env: { BUILD_STAMP, GIT_SHA, APP_VERSION_MINOR },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
        ],
      },
      {
        source: '/res/fonts/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*/opengraph-image(.*)',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-site' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          // Re-enable Vercel CDN caching for force-dynamic og-image routes.
          // force-dynamic sets no-store by default; this overrides it so the
          // edge caches the generated image for 1 hour (songs/profiles vary).
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
  serverExternalPackages: ["pino", "kuromoji", "kuroshiro", "kuroshiro-analyzer-kuromoji", "@logtail/node"],
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@base-ui-components/react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-select',
      '@radix-ui/react-popper',
    ],
  },
  turbopack: {
    resolveAlias: {
      "pino-pretty": { browser: "./src/lib/empty-module.js" },
      "@logtail/node": { browser: "./src/lib/empty-module.js" },
    },
  },
  images: {
    minimumCacheTTL: 2678400, // 31 days
    localPatterns: [
      {
        pathname: '/api/image-proxy',
      },
      {
        pathname: '/*.webp',
        search: '',
      },
      {
        pathname: '/**/*.png',
        search: '',
      },
      {
        pathname: '/**/*.webp',
        search: '',
      }
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'maimaidx.jp',
        port: '',
        pathname: '/maimai-mobile/img/Music/**',
      },
      {
        protocol: 'https',
        hostname: 'maimaidx-eng.com',
        port: '',
        pathname: '/maimai-mobile/img/Music/**',
      },
      {
        protocol: 'https',
        hostname: 'info-maimai.sega.jp',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.tomomai.lol',
        port: '',
        pathname: '/covers/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.cn.tomomai.lol',
        port: '',
        pathname: '/covers/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.tomomai.lol',
        port: '',
        pathname: '/icons/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.cn.tomomai.lol',
        port: '',
        pathname: '/icons/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.tomomai.lol',
        port: '',
        pathname: '/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.cn.tomomai.lol',
        port: '',
        pathname: '/avatars/**',
      }
    ],
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // The browser bundle and the edge runtime (middleware) can't load Node-only
    // deps, so alias them out. Mirrors the turbopack `browser` alias above.
    // (skia-canvas and the server-only render-image-server used to be wired
    // through here too; both moved out when rendering moved to apps/render.)
    if (!isServer || nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pino-pretty': false,
        '@logtail/node': false,
      };
    }
    return config;
  },
  // Pull in workspace-root node_modules so .pnpm-resolved deps (like
  // kuromoji's dict files) get traced and bundled at their real on-disk
  // path. kuromoji does __dirname-based dict lookups at runtime, so files
  // must be bundled at the .pnpm store path, not the apps/main symlink.
  outputFileTracingRoot: path.resolve(process.cwd(), '..', '..'),
  outputFileTracingIncludes: {
    '/api/image-proxy': ['./public/res/**/*'],
    '/api/admin/cache_images': ['./public/res/**/*'],
    '/**/*': ['../../node_modules/.pnpm/kuromoji@*/node_modules/kuromoji/dict/**/*'],
  },
  devIndicators: false,
};

const withVercelToolbar = withVercelToolbarPlugin();

export default withAnalyzer(withNextIntl(withVercelToolbar(nextConfig)));
