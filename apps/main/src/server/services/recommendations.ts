import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { parentPublicIdOf } from "@/lib/catalog/song-instance-id";
import type { VersionId } from "@/lib/metadata";
import { addRatingsAndSort } from "@/lib/rating-calculator";
import { recommendationPeers, type RecommendationPeers } from "@/lib/recommendation-potential";
import { logger } from "@/lib/logger";
import type { Region, SongBase, SongWithScore } from "@/lib/types";
import { getChartPercentiles, type ChartPercentileInput } from "@/server/queries/percentile";
import {
  ACCURACY_VALUES,
  generateRecommendations,
  generateUnplayedRecommendations,
  minUsefulLevelPrecise,
  unplayedRatingFloors,
  type RecommendationData,
  type UnplayedRecommendationData,
} from "@/server/queries/recommendations";
import { and, eq, gte, inArray, ne } from "drizzle-orm";

const MAX_PLAYED_PEER_CHARTS = 2000;
const MAX_UNPLAYED_PEER_CHARTS = 1500;
const MAX_UNPLAYED_RESULTS = 500;

export interface BuildRecommendationsInput {
  songs: SongWithScore[];
  gameVersion: number;
  region: Region;
  rating: number;
  usePeers: boolean;
  includeUnplayed: boolean;
}

export interface RecommendationsResult {
  improve: RecommendationData[];
  /** null when the unplayed list can't be shown, e.g. a profile that hides non-best scores. */
  tryNew: UnplayedRecommendationData[] | null;
}

async function fetchUnplayedCandidates(input: BuildRecommendationsInput, floor: number) {
  const played = new Set(input.songs.map(song => parentPublicIdOf(song.songId)));
  const rows = await db
    .select({
      songId: songInstanceId,
      parentPublicId: parentSong.publicId,
      parentId: songs.parentId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      genre: parentSong.genre,
      addedVersion: songs.addedVersion,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(songs.region, input.region),
      eq(songs.gameVersion, input.gameVersion),
      ne(parentSong.difficulty, "utage"),
      gte(songs.levelPrecise, minUsefulLevelPrecise(floor)),
    ));

  const candidates: SongBase[] = [];
  const parentIds = new Map<string, bigint>();
  for (const { parentPublicId, parentId, ...song } of rows) {
    if (played.has(parentPublicId)) continue;
    candidates.push({ ...song, addedVersion: song.addedVersion as VersionId });
    parentIds.set(song.songId, parentId);
  }
  return { candidates, parentIds };
}

async function fetchPeers(publicSongIds: string[], known: Map<string, bigint>, rating: number): Promise<Record<string, RecommendationPeers>> {
  const unknownParents = [...new Set(publicSongIds.filter(id => !known.has(id)).map(parentPublicIdOf))];
  const parentIds = new Map<string, bigint>();
  if (unknownParents.length) {
    const rows = await db.select({ id: parentSong.id, publicId: parentSong.publicId })
      .from(parentSong).where(inArray(parentSong.publicId, unknownParents));
    for (const row of rows) parentIds.set(row.publicId, row.id);
  }

  const inputs: ChartPercentileInput[] = publicSongIds.flatMap(publicSongId => {
    const parentId = known.get(publicSongId) ?? parentIds.get(parentPublicIdOf(publicSongId));
    return parentId == null ? [] : [{ publicSongId, parentId, achievement: 0 }];
  });
  const percentiles = await getChartPercentiles(inputs, rating, true);

  const result: Record<string, RecommendationPeers> = {};
  for (const [id, data] of percentiles) {
    const peers = recommendationPeers(data, ACCURACY_VALUES);
    if (peers != null) result[id] = peers;
  }
  return result;
}

export async function buildRecommendations(input: BuildRecommendationsInput): Promise<RecommendationsResult> {
  const songsWithRating = addRatingsAndSort(input.songs, input.gameVersion);
  const base = generateRecommendations(songsWithRating, input.gameVersion);

  let candidateParents = new Map<string, bigint>();
  let baseUnplayed: UnplayedRecommendationData[] = [];
  if (input.includeUnplayed) {
    const floors = unplayedRatingFloors(songsWithRating, input.gameVersion);
    const { candidates, parentIds } = await fetchUnplayedCandidates(input, Math.min(floors.new, floors.old));
    candidateParents = parentIds;
    baseUnplayed = generateUnplayedRecommendations(candidates, songsWithRating, input.gameVersion)
      .slice(0, MAX_UNPLAYED_PEER_CHARTS);
  }

  let peers: Record<string, RecommendationPeers> = {};
  if (input.usePeers && input.rating > 0) {
    const playedIds = [...new Set(base.map(rec => rec.song.songId))].slice(0, MAX_PLAYED_PEER_CHARTS);
    try {
      peers = await fetchPeers([...playedIds, ...baseUnplayed.map(rec => rec.song.songId)], candidateParents, input.rating);
    } catch (err) {
      logger.warn({ err, region: input.region, version: input.gameVersion }, "recommendation peers unavailable, ranking without them");
    }
  }

  const hasPeers = Object.keys(peers).length > 0;
  const improve = hasPeers ? generateRecommendations(songsWithRating, input.gameVersion, peers) : base;
  const tryNew = input.includeUnplayed
    ? (hasPeers
      ? generateUnplayedRecommendations(baseUnplayed.map(rec => rec.song), songsWithRating, input.gameVersion, peers)
      : baseUnplayed
    ).slice(0, MAX_UNPLAYED_RESULTS)
    : null;

  return { improve, tryNew };
}
