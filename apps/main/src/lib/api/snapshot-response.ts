import { type ApiKeyInfo, keyHasScope } from "@/lib/api/protect";
import { type ScopeKey } from "@/lib/api/scopes";
import { resolveGame } from "@/lib/games/registry";
import type { z } from "zod";
import type { snapshotDetail } from "./schemas";
import type { fetchSnapshotData } from "@/server/queries/snapshots";

type SnapshotData = NonNullable<Awaited<ReturnType<typeof fetchSnapshotData>>>;

/**
 * Build the JSON response for a snapshot detail endpoint.
 * `scopePrefix` is either "latest" or "all", used to resolve the correct scope keys.
 */
export function buildSnapshotPayload(
  { snapshot, songs, events }: SnapshotData,
  key: ApiKeyInfo,
  scopePrefix: "latest" | "all",
) {
  const scope = (s: string) => `snapshot:${scopePrefix}:${s}` as ScopeKey;

  const hasSongsRead = keyHasScope(key, scope("songs:read"));
  const hasSongsB50Read = keyHasScope(key, scope("songs:b50:read"));
  const hasEventsRead = keyHasScope(key, scope("events:read"));
  const hasIconRead = keyHasScope(key, scope("icon:read"));

  type SongPayload = NonNullable<z.infer<typeof snapshotDetail>["songs"]>[number];
  const songPayload = (s: SnapshotData["songs"][number]): SongPayload => ({
    songId: s.songId,
    songName: s.songName,
    artist: s.artist,
    cover: s.cover,
    difficulty: s.difficultyCode,
    level: s.level,
    levelPrecise: s.levelPrecise,
    type: s.typeCode,
    genre: s.genre,
    addedVersion: s.addedVersion,
    scoreValue: s.scoreValue,
    secondaryScore: s.secondaryScore,
    comboStatus: s.comboStatus,
    syncStatus: s.syncStatus,
    clearStatus: s.clearStatus,
  });
  let songsPayload: SongPayload[] | null = null;
  if (hasSongsRead) {
    songsPayload = songs.map(songPayload);
  } else if (hasSongsB50Read) {
    const adapter = resolveGame(snapshot.game).adapter;
    const rated = songs.map(song => ({
      ...song,
      chartId: song.songId,
      rating: adapter.calculateChartRating({ ...song, difficulty: song.difficultyCode }, snapshot.gameVersion),
    }));
    const selection = adapter.selectRankings(rated, snapshot.gameVersion);
    const b50 = [...selection.newScores, ...selection.oldScores];
    songsPayload = b50.map(s => ({ ...songPayload(s), rating: Math.floor(s.rating) }));
  }

  return {
    id: snapshot.publicId,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    rating: snapshot.rating,
    displayName: snapshot.displayName,
    gameVersion: snapshot.gameVersion,
    courseRankUrl: snapshot.courseRankUrl,
    classRankUrl: snapshot.classRankUrl,
    stars: snapshot.stars,
    versionPlayCount: snapshot.versionPlayCount,
    totalPlayCount: snapshot.totalPlayCount,
    iconUrl: hasIconRead ? snapshot.iconUrl : null,
    songs: songsPayload,
    events: hasEventsRead
      ? events.map((e) => ({
          eventType: e.eventType,
          name: e.name,
          currentDistance: e.currentDistance,
          nextRewardDistance: e.nextRewardDistance,
          state: e.state,
          imageUrl: e.imageUrl,
          eventPeriodStart: e.eventPeriodStart?.toISOString() ?? null,
          eventPeriodEnd: e.eventPeriodEnd?.toISOString() ?? null,
        }))
      : null,
  };
}
