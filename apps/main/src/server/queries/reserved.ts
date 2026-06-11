import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { getCurrentVersion } from "@tomomai/catalog/metadata";
import type { VersionId } from "@tomomai/catalog/metadata";
import { splitSongs } from "@/lib/rating-calculator";
import type { Difficulty, Region } from "@/lib/types";
import { and, desc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";

export const RESERVED_USERNAMES = new Set(["admin", "max", "maxbas", "maxadv", "maxexp", "maxmas", "maxrem"]);

// Ordered difficulty ladder (excludes "utage", which contributes 0 rating).
// A profile's `maxDifficulty` caps which charts it includes.
const DIFFICULTY_LADDER: Difficulty[] = ["basic", "advanced", "expert", "master", "remaster"];

function allowedDifficulties(cap: Difficulty): Difficulty[] {
  return DIFFICULTY_LADDER.slice(0, DIFFICULTY_LADDER.indexOf(cap) + 1);
}

export const RESERVED_ICON = "data:image/png;base64,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";

interface ReservedProfile {
  userId: string;
  username: string;
  displayName: string;
  profileMainRegion: Region;
  maxDifficulty: Difficulty;
}

const RESERVED_PROFILES: Record<string, ReservedProfile> = {
  max: {
    userId: "reserved-max",
    username: "max",
    displayName: "\uff4d\uff41\uff58\uff52\uff41\uff54\uff49\uff4e\uff47", // ｍａｘｒａｔｉｎｇ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "remaster",
  },
  maxbas: {
    userId: "reserved-maxbas",
    username: "maxbas",
    displayName: "ｍａｘｂａｓ", // ｍａｘｂａｓ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "basic",
  },
  maxadv: {
    userId: "reserved-maxadv",
    username: "maxadv",
    displayName: "ｍａｘａｄｖ", // ｍａｘａｄｖ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "advanced",
  },
  maxexp: {
    userId: "reserved-maxexp",
    username: "maxexp",
    displayName: "ｍａｘｅｘｐ", // ｍａｘｅｘｐ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "expert",
  },
  maxmas: {
    userId: "reserved-maxmas",
    username: "maxmas",
    displayName: "ｍａｘｍａｓ", // ｍａｘｍａｓ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "master",
  },
  maxrem: {
    userId: "reserved-maxrem",
    username: "maxrem",
    displayName: "ｍａｘｒｅｍ", // ｍａｘｒｅｍ
    profileMainRegion: getEnabledRegions()[0],
    maxDifficulty: "remaster",
  },
};

const songSelect = {
  songId: parentSong.publicId,
  songName: parentSong.songName,
  artist: parentSong.artist,
  cover: parentSong.cover,
  difficulty: parentSong.difficulty,
  level: songs.level,
  levelPrecise: songs.levelPrecise,
  type: parentSong.type,
  genre: parentSong.genre,
  addedVersion: songs.addedVersion,
} as const;

const fetchReservedSongs = unstable_cache(
  async (region: Region, maxDifficulty: Difficulty) => {
    const gameVersion = getCurrentVersion(region);
    const difficulties = allowedDifficulties(maxDifficulty);

    const [top100, currentVersionSongs] = await Promise.all([
      db
        .select(songSelect)
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(
          and(
            eq(songs.region, region),
            eq(songs.gameVersion, gameVersion),
            inArray(parentSong.difficulty, difficulties)
          )
        )
        .orderBy(desc(songs.levelPrecise))
        .limit(100),
      db
        .select(songSelect)
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(
          and(
            eq(songs.region, region),
            eq(songs.gameVersion, gameVersion),
            inArray(songs.addedVersion, [gameVersion, gameVersion - 1]),
            inArray(parentSong.difficulty, difficulties)
          )
        ),
    ]);

    // Deduplicate by songId+difficulty
    const seen = new Set<string>();
    const allSongs = [];
    for (const song of [...top100, ...currentVersionSongs]) {
      const key = `${song.songId}-${song.difficulty}`;
      if (!seen.has(key)) {
        seen.add(key);
        allSongs.push({
          ...song,
          achievement: 1010000,
          dxScore: 0,
          fc: "ap+" as const,
          fs: "fdx+" as const,
        });
      }
    }

    // Compute B50 rating
    const { newSongsB15, oldSongsB35 } = splitSongs(
      allSongs.map((s) => ({
        ...s,
        addedVersion: s.addedVersion as VersionId,
      })),
      gameVersion
    );
    const rating = [...newSongsB15, ...oldSongsB35].reduce(
      (sum, s) => sum + s.rating,
      0
    );

    return { songs: allSongs, gameVersion, rating };
  },
  ["reserved-songs"],
  { revalidate: 3600, tags: ["reserved-songs"] }
);

export function getReservedPublicUser(username: string) {
  const profile = RESERVED_PROFILES[username.toLowerCase()];
  if (!profile) return null;

  return {
    id: profile.userId,
    name: profile.displayName,
    publishProfile: true,
    profileMainRegion: profile.profileMainRegion,
    profileShowAllScores: false,
    profileShowScoreDetails: false,
    profileShowPlates: false,
    profileShowPlayCounts: true,
    profileShowEvents: false,
    profileShowInSearch: true,
  };
}

export async function getReservedSnapshots(username: string, region: Region) {
  const profile = RESERVED_PROFILES[username.toLowerCase()];
  if (!profile) return null;

  const { gameVersion, rating } = await fetchReservedSongs(region, profile.maxDifficulty);

  return [
    {
      id: "fixed",
      fetchedAt: new Date(),
      rating,
      displayName: profile.displayName,
      gameVersion: gameVersion as VersionId,
      courseRankUrl: "",
      classRankUrl: "",
      stars: 0,
      versionPlayCount: 0,
      totalPlayCount: 0,
    },
  ];
}

export async function getReservedSnapshotData(
  username: string,
  region: Region
) {
  const profile = RESERVED_PROFILES[username.toLowerCase()];
  if (!profile) return null;

  const { songs: reservedSongs, gameVersion, rating } =
    await fetchReservedSongs(region, profile.maxDifficulty);

  return {
    snapshot: {
      id: 0,
      publicId: "fixed",
      userId: profile.userId,
      region,
      fetchedAt: new Date(),
      gameVersion,
      rating,
      courseRankUrl: "https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_00T7GHJvGe.png",
      classRankUrl: "https://maimaidx-eng.com/maimai-mobile/img/class/class_rank_s_01VFe8gl5z.png",
      stars: 0,
      versionPlayCount: 0,
      totalPlayCount: 0,
      iconUrl: RESERVED_ICON,
      displayName: profile.displayName,
      title: "音ゲー界のカリスマ",
      titleType: "rainbow" as const,
    },
    songs: reservedSongs,
    events: [] as never[],
  };
}
