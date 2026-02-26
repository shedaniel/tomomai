import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { fetchLatestSnapshotData } from "@/server/queries/snapshots";
import { splitSongs } from "@/lib/rating-calculator";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";
import type { VersionId } from "@/lib/metadata";

export const GET = withApiKey(["snapshot:latest:metadata:read"], async (req: NextRequest, key) => {
  const region = req.nextUrl.searchParams.get("region") as Region | null;
  const enabledRegions = getEnabledRegions();

  if (!region || !enabledRegions.includes(region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabledRegions.join(", ")}` },
      { status: 400 }
    );
  }

  const data = await fetchLatestSnapshotData(key.userId, region);

  if (!data) {
    return Response.json({ error: "No snapshot found for this region" }, { status: 404 });
  }

  const { snapshot, songs, events } = data;

  // Determine which optional data to include based on scopes held by the key.
  const hasSongsRead = keyHasScope(key, "snapshot:latest:songs:read");
  const hasSongsB50Read = keyHasScope(key, "snapshot:latest:songs:b50:read");
  const hasEventsRead = keyHasScope(key, "snapshot:latest:events:read");
  const hasIconRead = keyHasScope(key, "snapshot:latest:icon:read");

  let songsPayload: unknown[] | null = null;
  if (hasSongsRead) {
    songsPayload = songs.map((s) => ({
      songId: s.songId,
      songName: s.songName,
      artist: s.artist,
      cover: s.cover,
      difficulty: s.difficulty,
      level: s.level,
      levelPrecise: s.levelPrecise / 10,
      type: s.type,
      genre: s.genre,
      addedVersion: s.addedVersion,
      achievement: s.achievement,
      dxScore: s.dxScore,
      fc: s.fc,
      fs: s.fs,
    }));
  } else if (hasSongsB50Read) {
    // B50 only — splitSongs expects raw DB levelPrecise (×10 integer)
    const { newSongsB15, oldSongsB35 } = splitSongs(
      songs,
      snapshot.gameVersion as VersionId
    );
    const b50 = [...newSongsB15, ...oldSongsB35];
    songsPayload = b50.map((s) => ({
      songId: s.songId,
      songName: s.songName,
      artist: s.artist,
      cover: s.cover,
      difficulty: s.difficulty,
      level: s.level,
      levelPrecise: s.levelPrecise / 10,
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

  return Response.json({
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
  });
});
