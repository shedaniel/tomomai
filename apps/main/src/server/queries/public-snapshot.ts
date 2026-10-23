import type { VersionId } from "@/lib/metadata";
import { splitSongs } from "@/lib/rating-calculator";
import type { Region, SongWithScore } from "@/lib/types";
import { TRPCError } from "@trpc/server";
import { resolvePublicUserByUsername } from "./public-access";
import { getReservedPublicUser, getReservedSnapshotData } from "./reserved";
import { fetchLatestSnapshotData } from "./snapshots";

/** Latest snapshot as shown on a public profile, with the owner's privacy settings applied. */
export async function fetchPublicSnapshotData(username: string, region: Region) {
  const reservedData = await getReservedSnapshotData(username, region);
  if (reservedData) {
    const reservedUser = getReservedPublicUser(username)!;
    return {
      snapshot: {
        ...reservedData.snapshot,
        publicId: undefined,
        id: reservedData.snapshot.publicId,
        gameVersion: reservedData.snapshot.gameVersion as VersionId,
      },
      songs: reservedData.songs.map((s) => ({
        ...s,
        addedVersion: s.addedVersion as VersionId,
      })),
      privacySettings: {
        showPlayCounts: reservedUser.profileShowPlayCounts,
        showPlates: reservedUser.profileShowPlates,
        showEvents: reservedUser.profileShowEvents,
        showAllScores: reservedUser.profileShowAllScores,
        showScoreDetails: reservedUser.profileShowScoreDetails,
      },
    };
  }

  const userData = await resolvePublicUserByUsername(username);

  const result = await fetchLatestSnapshotData(userData.id, region);

  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No data available for this region',
    });
  }

  const { snapshot, songs: songsWithScores, events } = result;

  const songsForCalculation: SongWithScore[] = songsWithScores.map(song => ({
    songId: song.songId,
    songName: song.songName,
    artist: song.artist,
    cover: song.cover,
    difficulty: song.difficulty,
    level: song.level,
    levelPrecise: song.levelPrecise,
    type: song.type,
    genre: song.genre,
    addedVersion: song.addedVersion as VersionId,
    achievement: song.achievement,
    dxScore: song.dxScore,
    fc: song.fc,
    fs: song.fs,
  }));

  let filteredSongs = songsWithScores;

  if (!userData.profileShowAllScores) {
    const { newSongsB15, oldSongsB35 } = splitSongs(songsForCalculation, snapshot.gameVersion);
    const bestSongs = [...newSongsB15, ...oldSongsB35];
    const bestSongIds = new Set(bestSongs.map(song => song.songId));
    filteredSongs = songsWithScores.filter(song => bestSongIds.has(song.songId));
  }

  const filteredEvents = userData.profileShowEvents ? events : undefined;

  return {
    snapshot: {
      ...snapshot,
      publicId: undefined,
      id: snapshot.publicId,
      gameVersion: snapshot.gameVersion as VersionId,
    },
    songs: filteredSongs as (Omit<typeof filteredSongs[number], "addedVersion"> & { addedVersion: VersionId })[],
    privacySettings: {
      showPlayCounts: userData.profileShowPlayCounts,
      showPlates: userData.profileShowPlates,
      showEvents: userData.profileShowEvents,
      showAllScores: userData.profileShowAllScores,
      showScoreDetails: userData.profileShowScoreDetails,
    },
    ...(filteredEvents && { events: filteredEvents }),
  };
}
