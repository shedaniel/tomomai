import type { GameSnapshotData } from "@/lib/games/player-view";
import { rateScores, sortByRating } from "@/lib/games/ranking";
import { getVersion } from "@/lib/games/versions";
import type { Region } from "@/lib/games/ids";
import { toMaimaiChart, toMaimaiResult, toMaimaiSnapshotHeader } from "./legacy-view";

type ExportedSnapshot = Pick<GameSnapshotData, "snapshot" | "songs"> & { region: Region };

/** The JSON download documented on the developer tab: maimai strings, songs in rating order. */
export function toMaimaiExport({ region, snapshot, songs }: ExportedSnapshot) {
  const header = toMaimaiSnapshotHeader(snapshot);
  return {
    metadata: {
      id: header.id,
      displayName: header.displayName,
      trophyType: header.titleType,
      trophy: header.title,
      region,
      fetchedAt: header.fetchedAt,
      gameVersion: getVersion("maimai", header.gameVersion)?.name ?? String(header.gameVersion),
      rating: header.rating,
      stars: header.stars,
      courseRankUrl: header.courseRankUrl,
      classRankUrl: header.classRankUrl,
      totalPlayCount: header.totalPlayCount,
      currentVersionPlayCount: header.versionPlayCount,
    },
    songs: sortByRating(rateScores("maimai", songs, header.gameVersion)).map(score => {
      const { difficulty, type } = toMaimaiChart(score);
      const { achievement, dxScore, fc, fs } = toMaimaiResult(score);
      return {
        songName: score.songName,
        artist: score.artist,
        cover: score.cover,
        difficulty,
        level: score.level,
        levelPrecise: score.levelPrecise,
        type,
        gameVersion: getVersion("maimai", score.addedVersion)?.shortName ?? String(score.addedVersion),
        achievement,
        dxScore,
        fc,
        fs,
        rating: score.rating,
      };
    }),
    iconUrl: header.iconUrl,
  };
}
