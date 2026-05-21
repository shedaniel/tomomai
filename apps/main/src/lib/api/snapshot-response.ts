import { type ApiKeyInfo, keyHasScope } from "@/lib/api/protect";
import { type ScopeKey } from "@/lib/api/scopes";
import { splitSongs } from "@/lib/rating-calculator";
import type { VersionId } from "@/lib/metadata";
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

  type SongPayload = {
    songId: string;
    songName: string;
    artist: string;
    cover: string | null;
    difficulty: string;
    level: string;
    levelPrecise: number;
    type: string;
    genre: string;
    addedVersion: number;
    achievement: number;
    dxScore: number;
    fc: string;
    fs: string;
    rating?: number;
  };
  let songsPayload: SongPayload[] | null = null;
  if (hasSongsRead) {
    songsPayload = songs.map((s) => ({
      songId: s.songId,
      songName: s.songName,
      artist: s.artist,
      cover: s.cover,
      difficulty: s.difficulty,
      level: s.level,
      levelPrecise: s.levelPrecise,
      type: s.type,
      genre: s.genre,
      addedVersion: s.addedVersion,
      achievement: s.achievement,
      dxScore: s.dxScore,
      fc: s.fc,
      fs: s.fs,
    }));
  } else if (hasSongsB50Read) {
    // splitSongs expects raw DB levelPrecise (×10 integer)
    const { newSongsB15, oldSongsB35 } = splitSongs(
      songs,
      snapshot.gameVersion as VersionId,
    );
    const b50 = [...newSongsB15, ...oldSongsB35];
    songsPayload = b50.map((s) => ({
      songId: s.songId,
      songName: s.songName,
      artist: s.artist,
      cover: s.cover,
      difficulty: s.difficulty,
      level: s.level,
      levelPrecise: s.levelPrecise,
      type: s.type,
      genre: s.genre,
      addedVersion: s.addedVersion,
      achievement: s.achievement,
      dxScore: s.dxScore,
      fc: s.fc,
      fs: s.fs,
      rating: Math.floor(s.rating),
    }));
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
