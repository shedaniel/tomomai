import { getEnabledRegions } from '@/lib/games/regions';
import { splitSongs } from '@/lib/rating-calculator';
import type { Region } from '@/lib/types';
import type { SongWithScore } from '@/lib/games/maimai/types';
import { fetchLatestMaimaiSnapshotData } from '@/server/queries/snapshots';
import { getRatingComment } from './responses';
import { t } from './i18n';

/**
 * Resolve which region a command should operate on, or null when maimai has
 * no enabled region.
 *
 * Priority: an explicit param (if it names an enabled region) > the user's
 * selected region from the DB (if enabled) > intl > the first enabled region.
 */
export function resolveRegion(
  param: string | null | undefined,
  userRegion: Region | null | undefined
): Region | null {
  const enabled = getEnabledRegions('maimai');
  const requested = enabled.find(region => region === param);
  if (requested) return requested;
  if (userRegion && enabled.includes(userRegion)) return userRegion;
  if (enabled.includes('intl')) return 'intl';
  return enabled[0] ?? null;
}

export interface ProfileSummary {
  publicId: string;
  rating: number;
  newRating: number;
  newCount: number;
  oldRating: number;
  oldCount: number;
  stars: number;
  totalPlayCount: number;
  fetchedAt: Date;
}

/**
 * Load the latest snapshot for a user/region and compute the new-charts (B15)
 * and old-charts (B35) rating totals alongside the stored summary fields.
 */
export async function getProfileSummary(userId: string, region: Region): Promise<ProfileSummary | null> {
  const data = await fetchLatestMaimaiSnapshotData(userId, region);
  if (!data) return null;

  const { snapshot, songs } = data;
  const { newSongsB15, oldSongsB35 } = splitSongs(songs as SongWithScore[], snapshot.gameVersion);
  const newRating = newSongsB15.reduce((sum, s) => sum + s.rating, 0);
  const oldRating = oldSongsB35.reduce((sum, s) => sum + s.rating, 0);

  return {
    publicId: snapshot.publicId,
    rating: snapshot.rating,
    newRating,
    newCount: newSongsB15.length,
    oldRating,
    oldCount: oldSongsB35.length,
    stars: snapshot.stars,
    totalPlayCount: snapshot.totalPlayCount,
    fetchedAt: snapshot.fetchedAt,
  };
}

/**
 * Build the simple two-line roast text used by /profile and /fetch:
 *
 *   <@user> {comment}, you only have **{rating}** rating! 😤 (Region)
 *   -# New Charts: {b15} (avg: {b15avg}) - Old Charts: {b35} (avg: {b35avg}) - Stars: {stars} - Total Plays: {plays}
 */
export function formatProfileSummaryContent(
  discordUserId: string,
  summary: ProfileSummary,
  regionName?: string,
  locale?: string,
): string {
  const comment = getRatingComment(summary.rating);
  const newAvg = summary.newCount > 0 ? (summary.newRating / summary.newCount).toFixed(1) : '0.0';
  const oldAvg = summary.oldCount > 0 ? (summary.oldRating / summary.oldCount).toFixed(1) : '0.0';
  const regionSuffix = regionName ? ` (${regionName})` : '';
  return t(locale, 'profile.content', {
    userId: discordUserId,
    comment,
    rating: String(summary.rating),
    regionSuffix,
    newRating: String(summary.newRating),
    newAvg,
    oldRating: String(summary.oldRating),
    oldAvg,
    stars: String(summary.stars),
    totalPlays: String(summary.totalPlayCount),
  });
}
