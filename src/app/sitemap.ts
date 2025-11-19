import type { MetadataRoute } from 'next'
import { resolveBaseUrl } from '@/lib/base-url';
import { TYPES as DB_TYPES } from './db/layout';
import { user, userSnapshots } from '@/lib/db/schema-pg';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';

type SitemapItem = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();

  const profiles = await db
    .select({
      username: user.username,
      latestSnapshotAt: sql<Date | null>`max(${userSnapshots.fetchedAt})`,
    })
    .from(user)
    .leftJoin(userSnapshots, eq(user.id, userSnapshots.userId))
    .where(
      and(
        eq(user.publishProfile, true),
        eq(user.profileShowInSearch, true),
      ),
    )
    .groupBy(user.id, user.username);

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/db/home`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    ...DB_TYPES.map((type) => ({
      url: `${baseUrl}/db/${type}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }) satisfies SitemapItem),
    ...profiles.map((profile) => ({
      url: `${baseUrl}/profile/${profile.username}`,
      lastModified: profile.latestSnapshotAt ?? new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    }) satisfies SitemapItem),
  ]
}