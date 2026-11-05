import { type ApiKeyInfo, keyHasScope } from "@/lib/api/protect";
import { type ScopeKey } from "@/lib/api/scopes";
import type { z } from "zod";
import { GAME_API_DETAILS, type snapshotDetail } from "./schemas";
import { fetchSnapshotRankings, type fetchSnapshotData } from "@/server/queries/snapshots";

type SnapshotData = NonNullable<Awaited<ReturnType<typeof fetchSnapshotData>>>;

/**
 * Build the JSON response for a snapshot detail endpoint.
 * `scopePrefix` is either "latest" or "all", used to resolve the correct scope keys.
 */
export async function buildSnapshotPayload(
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
    const { newScores, oldScores } = await fetchSnapshotRankings(snapshot.game, key.userId, snapshot);
    songsPayload = [...newScores, ...oldScores].map(s => ({ ...songPayload(s), rating: s.rating }));
  }

  return {
    id: snapshot.publicId,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    rating: snapshot.rating,
    displayName: snapshot.displayName,
    gameVersion: snapshot.gameVersion,
    versionPlayCount: snapshot.versionPlayCount,
    totalPlayCount: snapshot.totalPlayCount,
    details: GAME_API_DETAILS[snapshot.game].snapshot(snapshot),
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
