import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withVercelToolbar as withVercelToolbarPlugin } from "@vercel/toolbar/plugins/next";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  serverExternalPackages: ["skia-canvas", "pino", "pino-pretty", "kuromoji", "kuroshiro", "kuroshiro-analyzer-kuromoji"],
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
      }
    ],
  },
  webpack: (config, { isServer }) => {
    // Ignore server-only file on client builds
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        './render-image-server': false,
      };
    } else {
      config.externals = [
        ...config.externals,
        { 'skia-canvas': 'commonjs skia-canvas' },
      ]
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

export default withNextIntl(withVercelToolbar(nextConfig));
