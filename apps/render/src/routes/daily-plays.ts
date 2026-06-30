import { renderDailyPlaysImage } from '../lib/render-image';
import type { SongForRender } from '../lib/render-image';
import { commonSnapshotResources, renderToWebp, type RenderOutcome } from '../render-route';
import { getCatalog } from '../lib/catalog';
import { calculateSongRating } from '../lib/rating-calculator';
import type { Region, SnapshotMetadata } from '../lib/types';
import type { RenderMessage } from '@tomomai/render-token';

/**
 * daily-plays route: decode token → join catalog → compute ratings → render.
 *
 * The token carries the day's plays (songId + achievement + fc + fs); catalog
 * fields are joined from /api/v1/songs. Per-play rating is computed here
 * (deterministic: catalog levelPrecise + achievement + fc + gameVersion).
 */
export async function renderDailyPlays(
  message: Extract<RenderMessage, { route: 'daily-plays' }>,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  const { header, payload } = message;
  const region = header.region as Region;

  const catalog = await getCatalog();

  const plays = payload.plays.map((p) => {
    const entry = catalog.get(p.songId);
    if (!entry) throw new Error(`Chart not in catalogue: ${p.songId}`);
    const song: SongForRender = {
      songName: entry.songName,
      cover: entry.cover,
      difficulty: entry.difficulty as SongForRender['difficulty'],
      type: entry.type as SongForRender['type'],
      levelPrecise: entry.levelPrecise,
      addedVersion: entry.addedVersion,
      achievement: p.achievement,
      fc: p.fc,
      fs: p.fs,
    };
    return { ...song, rating: Math.floor(calculateSongRating(song, header.gameVersion)) };
  });

  const snapshot: SnapshotMetadata = {
    id: '',
    fetchedAt: new Date(),
    gameVersion: header.gameVersion,
    rating: header.rating,
    iconUrl: header.iconUrl,
    displayName: header.displayName,
    title: header.title,
    titleType: header.titleType,
    courseRankUrl: header.courseRankUrl,
    classRankUrl: header.classRankUrl,
    stars: 0,
  };

  return renderToWebp({
    routeName: 'daily-plays',
    requestId: opts.requestId,
    scale: header.scale,
    profile: opts.profile,
    resources: [
      ...commonSnapshotResources(snapshot, region),
      ...plays.map(p => p.cover),
    ],
    render: (cache) => renderDailyPlaysImage(plays, snapshot, region, payload.day, cache),
    filename: `maimai-daily-${payload.day}`,
  });
}
