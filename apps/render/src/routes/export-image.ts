import { renderImage } from '../lib/render-image';
import type { SongForRender } from '../lib/render-image';
import { commonSnapshotResources, renderToWebp, type RenderOutcome } from '../render-route';
import { getCatalog } from '../lib/catalog';
import { splitSongs } from '../lib/rating-calculator';
import type { Region } from '../lib/types';
import type { RenderMessage } from '@tomomai/render-token';

/**
 * export-image route: decode token → join catalog → render.
 *
 * The token carries B50 score data (songId + achievement + fc + fs per chart);
 * catalog fields (songName, cover, difficulty, levelPrecise, type, addedVersion)
 * are joined from /api/v1/songs. No DB access.
 */
export async function renderExportImage(
  message: Extract<RenderMessage, { route: 'export-image' }>,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  const { header, payload } = message;
  const region = header.region as Region;

  const catalog = await getCatalog();

  const songs: SongForRender[] = payload.charts.map((c) => {
    const entry = catalog.get(c.songId);
    if (!entry) throw new Error(`Chart not in catalogue: ${c.songId}`);
    return {
      songName: entry.songName,
      cover: entry.cover,
      difficulty: entry.difficulty as SongForRender['difficulty'],
      type: entry.type as SongForRender['type'],
      levelPrecise: entry.levelPrecise,
      addedVersion: entry.addedVersion,
      achievement: c.achievement,
      fc: c.fc,
      fs: c.fs,
    };
  });

  const { newSongsB15, oldSongsB35 } = splitSongs(songs, header.gameVersion);

  const snapshotData = {
    snapshot: {
      id: '',
      fetchedAt: new Date(),
      rating: header.rating,
      displayName: header.displayName,
      gameVersion: header.gameVersion,
      courseRankUrl: header.courseRankUrl,
      classRankUrl: header.classRankUrl,
      stars: 0,
      versionPlayCount: 0,
      totalPlayCount: 0,
      title: header.title,
      titleType: header.titleType,
      iconUrl: header.iconUrl,
    },
    songs,
  };

  return renderToWebp({
    routeName: 'export-image',
    requestId: opts.requestId,
    scale: header.scale,
    profile: opts.profile,
    resources: [
      ...commonSnapshotResources(snapshotData.snapshot, region),
      `/res/label/new.png`,
      `/res/label/old.png`,
      ...newSongsB15.map(s => s.cover),
      ...oldSongsB35.map(s => s.cover),
    ],
    render: (cache) => renderImage(snapshotData, region, cache, payload.visitableProfileAt),
    filename: 'maimai-profile-snapshot',
  });
}
