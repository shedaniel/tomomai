import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withVercelToolbar as withVercelToolbarPlugin } from "@vercel/toolbar/plugins/next";
import withBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  transpilePackages: ["@tomomai/ui"],
  async headers() {
    return [
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
  serverExternalPackages: ["skia-canvas", "pino", "pino-pretty", "kuromoji", "kuroshiro", "kuroshiro-analyzer-kuromoji", "@logtail/node"],
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
      }
    ],
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // Ignore server-only file on client builds
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        './render-image-server': false,
        'pino-pretty': false,
        '@logtail/node': false,
      };
    } else {
      config.externals = [
        ...config.externals,
        { 'skia-canvas': 'commonjs skia-canvas' },
      ]
      // The edge runtime (middleware) can't load Node-only deps either.
      // Mirrors the turbopack `browser` alias above.
      if (nextRuntime === 'edge') {
        config.resolve.alias = {
          ...config.resolve.alias,
          'pino-pretty': false,
          '@logtail/node': false,
        };
      }
    }
    return config;
  },
  outputFileTracingIncludes: {
    '/api/image-proxy': ['./public/res/**/*'],
    '/api/export-image': ['./public/res/**/*'],
    '/api/admin/cache_images': ['./public/res/**/*'],
    '/**/*': ['./node_modules/kuromoji/dict/**/*'],
  },
  devIndicators: false,
};

const withVercelToolbar = withVercelToolbarPlugin();

export default withAnalyzer(withNextIntl(withVercelToolbar(nextConfig)));
