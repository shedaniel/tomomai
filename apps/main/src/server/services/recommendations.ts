import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { hasCapability } from "@/lib/games/access";
import type { Region } from "@/lib/games/ids";
import type { GameSnapshotData } from "@/lib/games/player-view";
import {
  generateRecommendations,
  generateUnplayedRecommendations,
  minUsefulLevelPrecise,
  ratedDifficultyCodes,
  unplayedRatingFloors,
  type RecommendationChart,
  type RecommendationData,
  type RecommendationPeers,
  type UnplayedRecommendationData,
} from "@/lib/games/recommendations";
import { logger } from "@/lib/logger";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { parentPublicIdOf } from "@tomomai/games/song-ids";
import { and, eq, gte, inArray } from "drizzle-orm";

const MAX_PLAYED_PEER_CHARTS = 2000;
const MAX_UNPLAYED_PEER_CHARTS = 1500;
const MAX_UNPLAYED_RESULTS = 500;

export interface BuildRecommendationsInput {
  data: GameSnapshotData;
  region: Region;
  usePeers: boolean;
  includeUnplayed: boolean;
}

export interface RecommendationsResult {
  improve: RecommendationData[];
  /** null when the unplayed list can't be shown, e.g. a profile that hides non-best scores. */
  tryNew: UnplayedRecommendationData[] | null;
}

async function fetchUnplayedCandidates({ data, region }: BuildRecommendationsInput, floor: number) {
  const { game, gameVersion } = data.snapshot;
  const played = new Set(data.songs.map(song => parentPublicIdOf(song.songId)));
  const rows = await db
    .select({
      songId: songInstanceId,
      parentPublicId: parentSong.publicId,
      parentId: songs.parentId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      genre: parentSong.genre,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      addedVersion: songs.addedVersion,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(songs.game, game),
      eq(songs.region, region),
      eq(songs.gameVersion, gameVersion),
      inArray(parentSong.difficulty, ratedDifficultyCodes(game)),
      gte(songs.levelPrecise, minUsefulLevelPrecise(game, gameVersion, floor)),
    ));

  const candidates: RecommendationChart[] = [];
  const parentIds = new Map<string, bigint>();
  for (const { parentPublicId, parentId, ...chart } of rows) {
    if (played.has(parentPublicId)) continue;
    candidates.push(chart);
    parentIds.set(chart.songId, parentId);
  }
  return { candidates, parentIds };
}

/** Peers come from the game's percentile service while it offers percentiles in the region. */
async function fetchPeers(input: BuildRecommendationsInput, publicSongIds: string[], knownParentIds: ReadonlyMap<string, bigint>) {
  const { game, rating, gameVersion } = input.data.snapshot;
  const { recommendationPeers } = GAME_SERVER_MODULES[game];
  if (!input.usePeers || rating <= 0 || !recommendationPeers || !hasCapability(game, "percentiles", input.region)) return {};
  try {
    return await recommendationPeers(publicSongIds, rating, knownParentIds);
  } catch (err) {
    logger.warn({ err, region: input.region, version: gameVersion }, "recommendation peers unavailable, ranking without them");
    return {};
  }
}

/** Both recommendation lists, ranked with nearby-Rating peers when the game has them, so a client renders them once. */
export async function buildRecommendations(input: BuildRecommendationsInput): Promise<RecommendationsResult> {
  const { data } = input;
  const base = generateRecommendations(data);

  let candidateParents = new Map<string, bigint>();
  let baseUnplayed: UnplayedRecommendationData[] = [];
  if (input.includeUnplayed) {
    const floors = unplayedRatingFloors(data);
    const { candidates, parentIds } = await fetchUnplayedCandidates(input, Math.min(floors.new, floors.old));
    candidateParents = parentIds;
    baseUnplayed = generateUnplayedRecommendations(data, candidates).slice(0, MAX_UNPLAYED_PEER_CHARTS);
  }

  const playedIds = [...new Set(base.map(rec => rec.song.songId))].slice(0, MAX_PLAYED_PEER_CHARTS);
  const peers: Record<string, RecommendationPeers> = await fetchPeers(
    input,
    [...playedIds, ...baseUnplayed.map(rec => rec.song.songId)],
    candidateParents,
  );

  const hasPeers = Object.keys(peers).length > 0;
  const improve = hasPeers ? generateRecommendations(data, peers) : base;
  const tryNew = input.includeUnplayed
    ? (hasPeers ? generateUnplayedRecommendations(data, baseUnplayed.map(rec => rec.song), peers) : baseUnplayed).slice(0, MAX_UNPLAYED_RESULTS)
    : null;

  return { improve, tryNew };
}
