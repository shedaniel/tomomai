import type { MetadataRoute } from 'next'
import { resolveBaseUrl } from '@/lib/base-url';
import { DB_TYPES } from '@/lib/db/types';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAllPostsMeta, getAvailableTranslations } from '@/lib/posts';
import { defaultLocale } from '@/i18n/locale';

/** Build a localized absolute URL for the sitemap. */
const loc = (baseUrl: string, path: string) =>
  `${baseUrl}/${defaultLocale}${path === '/' ? '' : path}`;

type SitemapItem = MetadataRoute.Sitemap[number];

export const revalidate = 21600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();

  const latestSnapshotAt = sql<Date | null>`max(${userSnapshots.fetchedAt})`;
  const profiles = await db
    .select({
      username: user.username,
      latestSnapshotAt,
    })
    .from(user)
    .leftJoin(userSnapshots, eq(user.id, userSnapshots.userId))
    .where(
      and(
        eq(user.publishProfile, true),
        eq(user.profileShowInSearch, true),
      ),
    )
    .groupBy(user.id, user.username)
    .orderBy(sql`${latestSnapshotAt} desc nulls last`)
    .limit(50);
  // Get all posts for sitemap (using English as base)
  const posts = getAllPostsMeta('en');
  const postSitemapItems = posts.map((post) => {
    const available = getAvailableTranslations(post.canonicalSlug);
    const languages: Record<string, string> = {};
    for (const l of available) {
      languages[l] = `${baseUrl}/${l}/db/posts/${post.slug}`;
    }
    languages['x-default'] = `${baseUrl}/${defaultLocale}/db/posts/${post.slug}`;
    return {
      url: loc(baseUrl, `/db/posts/${post.slug}`),
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: {
        languages,
      },
    } satisfies SitemapItem;
  });

  return [
    {
      url: loc(baseUrl, '/'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...DB_TYPES.map((type) => ({
      url: loc(baseUrl, `/db/${type}`),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }) satisfies SitemapItem),
    ...postSitemapItems,
    ...profiles.map((profile) => ({
      url: loc(baseUrl, `/profile/${profile.username}`),
      lastModified: profile.latestSnapshotAt ?? new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }) satisfies SitemapItem),
  ]
}
