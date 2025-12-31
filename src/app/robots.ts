import { resolveBaseUrl } from '@/lib/base-url'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin/',
    },
    sitemap: `${resolveBaseUrl()}/sitemap.xml`,
  }
}
