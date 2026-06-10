import type { MetadataRoute } from 'next'
import { resolveBaseUrl } from '@/lib/base-url';
import { DB_TYPES } from '@/lib/db/types';
import { user, userSnapshots, parentSong, songs } from '@/lib/db/schema-pg';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSongSlug } from '@/lib/song-slug';
import { getAllPostsMeta, getAvailableTranslations } from '@/lib/posts';

type SitemapItem = MetadataRoute.Sitemap[number];

export const revalidate = 21600; // Revalidate once every 6 hours

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();

  // Get public profiles
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

  // Get unique songs for sitemap
  type Song = { songName: string; artist: string; type: "std" | "dx" }
  const uniqueSongs: Song[] = await db
    .select({
      songName: parentSong.songName,
      artist: parentSong.artist,
      type: parentSong.type,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(ne(parentSong.difficulty, "utage"))
    .groupBy(parentSong.songName, parentSong.artist, parentSong.type);

  // Deduplicate songs by songName + type
  const songSet = new Map<string, Song>();
  for (const song of uniqueSongs) {
    const key = `${song.songName}||${song.type}`;
    if (!songSet.has(key)) {
      songSet.set(key, song as Song);
    }
  }

  // Generate slugs for all songs in parallel
  const songsArray = Array.from(songSet.values());

  // Detect same slugs and print as errors
  const counter = new Map<string, Song[]>();
  for (const song of songsArray) {
    const slug = await getSongSlug(song);
    if (!counter.has(slug)) {
      counter.set(slug, [song]);
    } else {
      counter.get(slug)!.push(song);
    }
  }

  for (const [slug, songs] of counter.entries()) {
    if (songs.length > 1) {
      console.error(`Same slug found: ${slug} for ${songs.map(s => `'${s.songName}' by '${s.artist}'`).join(', ')}`);
    }
  }

  const songSitemapItems = counter.keys().map((slug) => ({
    url: `${baseUrl}/db/songs/${encodeURIComponent(slug)}`,
    changeFrequency: 'monthly',
    priority: 0.55,
  } satisfies SitemapItem));

  // Get all posts for sitemap (using English as base)
  const posts = getAllPostsMeta('en');
  const postSitemapItems = posts.map((post) => {
    const translations = getAvailableTranslations(post.canonicalSlug);

    return {
      url: `${baseUrl}/db/posts/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: {
        languages: translations.reduce((acc, lang) => ({
          ...acc,
          [lang]: `${baseUrl}/db/posts/${post.slug}`,
        }), {}),
      },
    } satisfies SitemapItem;
  });

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...DB_TYPES.map((type) => ({
      url: `${baseUrl}/db/${type}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }) satisfies SitemapItem),
    ...postSitemapItems,
    ...profiles.map((profile) => ({
      url: `${baseUrl}/profile/${profile.username}`,
      lastModified: profile.latestSnapshotAt ?? new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }) satisfies SitemapItem),
    ...songSitemapItems,
  ]
}
