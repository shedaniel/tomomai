import { resolveBaseUrl } from '@/lib/base-url'
import type { MetadataRoute } from 'next'

export const revalidate = 21600

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/api/',
        '/auth/',
        '/settings/',
        '/cn-proxy/',
        '/maintenance',
        '/_next/image',
        '/_next/static/',
        '/_next/data/',
      ],
    },
    sitemap: `${resolveBaseUrl()}/sitemap.xml`,
  }
}
