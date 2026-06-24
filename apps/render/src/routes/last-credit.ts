import { renderLastCreditImage } from '../lib/render-image';
import { commonSnapshotResources, renderToWebp, type RenderOutcome } from '../render-route';
import { getCatalog } from '../lib/catalog';
import type { Region, CreditData, SnapshotMetadata, RecentSongData, RecentSongDetails } from '../lib/types';
import type { RenderMessage } from '@tomomai/render-token';
import type { Difficulty } from '@tomomai/render-token';

/** All sprites the last-credit renderer reads (fixed set, not data-dependent). */
const LAST_CREDIT_SPRITES = [
  '/res/numbers/percentage_blue', '/res/numbers/percentage_red', '/res/numbers/percentage_gold',
  '/res/numbers/score_blue', '/res/numbers/score_red', '/res/numbers/score_gold',
  '/res/numbers/score_big_blue', '/res/numbers/score_big_red', '/res/numbers/score_big_gold',
  '/res/numbers/score_num_count', '/res/numbers/score_num_count_big',
  '/res/numbers/level_basic', '/res/numbers/level_advanced', '/res/numbers/level_expert',
  '/res/numbers/level_master', '/res/numbers/level_remaster', '/res/numbers/level_utage',
  '/res/songs/score_table', '/res/songs/fast_late', '/res/songs/track_1', '/res/songs/track_2',
  '/res/songs/track_3', '/res/songs/dxscore', '/res/songs/star_1', '/res/songs/star_2', '/res/songs/star_3',
  '/res/icons/base', '/res/icons/sync_base', '/res/icons/sync', '/res/icons/fc_base', '/res/icons/fc',
  '/res/icons/fc+', '/res/icons/ap_base', '/res/icons/ap', '/res/icons/ap+',
  '/res/icons/fs_base', '/res/icons/fs', '/res/icons/fs+', '/res/icons/fdx_base', '/res/icons/fdx',
  '/res/icons/fdx+',
].map(p => `${p}.png`);

const DIFFICULTY_SPRITES = ['basic', 'advanced', 'expert', 'master', 'remaster', 'utage'];

/**
 * last-credit route: decode token → join catalog → render.
 *
 * The token carries the credit tracks (songId + achievement + fc + fs + dxScore
 * + maxDxScore + optional detail breakdowns); catalog fields are joined from
 * /api/v1/songs. No DB access.
 */
export async function renderLastCredit(
  message: Extract<RenderMessage, { route: 'last-credit' }>,
  opts: { requestId: string; profile: boolean },
): Promise<RenderOutcome> {
  const { header, payload } = message;
  const region = header.region as Region;

  const catalog = await getCatalog();

  const tracks: RecentSongData[] = payload.tracks.map((t, index) => {
    const entry = catalog.get(t.songId);
    if (!entry) throw new Error(`Chart not in catalogue: ${t.songId}`);
    const details: RecentSongDetails | null = t.details
      ? {
          fastCount: t.details.fastCount,
          lateCount: t.details.lateCount,
          combo: 0,
          maxCombo: 0,
          syncScore: null,
          maxSyncScore: null,
          rating: 0,
          ratingChange: 0,
          venue: null,
          tapCPerfect: t.details.tap.criticalPerfect,
          tapPerfect: t.details.tap.perfect,
          tapGreat: t.details.tap.great,
          tapGood: t.details.tap.good,
          tapMiss: t.details.tap.miss,
          holdCPerfect: t.details.hold.criticalPerfect,
          holdPerfect: t.details.hold.perfect,
          holdGreat: t.details.hold.great,
          holdGood: t.details.hold.good,
          holdMiss: t.details.hold.miss,
          slideCPerfect: t.details.slide.criticalPerfect,
          slidePerfect: t.details.slide.perfect,
          slideGreat: t.details.slide.great,
          slideGood: t.details.slide.good,
          slideMiss: t.details.slide.miss,
          touchCPerfect: t.details.touch.criticalPerfect,
          touchPerfect: t.details.touch.perfect,
          touchGreat: t.details.touch.great,
          touchGood: t.details.touch.good,
          touchMiss: t.details.touch.miss,
          breakCPerfect: t.details.break.criticalPerfect,
          breakPerfect: t.details.break.perfect,
          breakGreat: t.details.break.great,
          breakGood: t.details.break.good,
          breakMiss: t.details.break.miss,
        }
      : null;

    return {
      id: BigInt(index),
      playedAt: new Date(),
      achievement: t.achievement,
      dxScore: t.dxScore,
      maxDxScore: t.maxDxScore,
      fc: t.fc,
      fs: t.fs,
      track: index + 1,
      songName: entry.songName,
      artist: entry.artist,
      cover: entry.cover,
      difficulty: entry.difficulty,
      level: entry.level,
      levelPrecise: entry.levelPrecise,
      type: entry.type,
      addedVersion: entry.addedVersion,
      details,
    };
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

  const creditData: CreditData = {
    playedAt: new Date(payload.playedAt * 1000),
    tracks,
  };

  return renderToWebp({
    routeName: 'last-credit',
    requestId: opts.requestId,
    scale: header.scale,
    profile: opts.profile,
    resources: [
      ...commonSnapshotResources(snapshot, region),
      `/res/bg/${snapshot.gameVersion}_long.png`,
      ...LAST_CREDIT_SPRITES,
      ...DIFFICULTY_SPRITES.map(d => `/res/songs/song_${d}.png`),
      ...DIFFICULTY_SPRITES.map(d => `/res/songs/music_jacket_${d}.png`),
      ...tracks.map(t => t.cover),
    ],
    render: (cache) => renderLastCreditImage(creditData, snapshot, region, cache),
    filename: 'maimai-last-credit',
  });
}
