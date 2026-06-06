import { getEnabledRegions } from '@/lib/enabled-regions';
import { splitSongs } from '@/lib/rating-calculator';
import type { Region, SongWithScore } from '@/lib/types';
import { fetchLatestSnapshotData } from '@/server/queries/snapshots';
import { getRatingComment } from './responses';

const REGION_NAMES: Record<Region, string> = {
  intl: 'International',
  jp: 'Japan',
  cn: 'China',
};

export function regionDisplayName(region: Region): string {
  return REGION_NAMES[region] ?? region;
}

/**
 * Resolve which region a command should operate on.
 *
 * Priority: an explicit param (if it names an enabled region) > the user's
 * selected region from the DB (if enabled) > intl > the first enabled region.
 */
export function resolveRegion(
  param: string | null | undefined,
  userRegion: Region | null | undefined
): Region {
  const enabled = getEnabledRegions();
  if (param && enabled.includes(param as Region)) return param as Region;
  if (userRegion && enabled.includes(userRegion)) return userRegion;
  if (enabled.includes('intl')) return 'intl';
  return enabled[0];
}

export interface ProfileSummary {
  publicId: string;
  rating: number;
  newRating: number;
  oldRating: number;
  stars: number;
  totalPlayCount: number;
  fetchedAt: Date;
}

/**
 * Load the latest snapshot for a user/region and compute the new-charts (B15)
 * and old-charts (B35) rating totals alongside the stored summary fields.
 */
export async function getProfileSummary(userId: string, region: Region): Promise<ProfileSummary | null> {
  const data = await fetchLatestSnapshotData(userId, region);
  if (!data) return null;

  const { snapshot, songs } = data;
  const { newSongsB15, oldSongsB35 } = splitSongs(songs as SongWithScore[], snapshot.gameVersion);
  const newRating = newSongsB15.reduce((sum, s) => sum + s.rating, 0);
  const oldRating = oldSongsB35.reduce((sum, s) => sum + s.rating, 0);

  return {
    publicId: snapshot.publicId,
    rating: snapshot.rating,
    newRating,
    oldRating,
    stars: snapshot.stars,
    totalPlayCount: snapshot.totalPlayCount,
    fetchedAt: snapshot.fetchedAt,
  };
}

/**
 * Build the simple two-line roast text used by /profile and /fetch:
 *
 *   <@user> {comment}, you only have **{rating}** rating! 😤
 *   -# New Charts: {b15} - Old Charts: {b35} - Stars: {stars} - Total Plays: {plays}
 */
export function formatProfileSummaryContent(discordUserId: string, summary: ProfileSummary): string {
  const comment = getRatingComment(summary.rating);
  return (
    `<@${discordUserId}> ${comment}, you only have **${summary.rating}** rating! 😤\n` +
    `-# New Charts: ${summary.newRating} - Old Charts: ${summary.oldRating} - Stars: ${summary.stars} - Total Plays: ${summary.totalPlayCount}`
  );
}
