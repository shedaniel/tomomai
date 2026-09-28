import "server-only";
import { getReservedSnapshotData } from "@/server/queries/reserved";
import { chartTypeToCode, comboStatusToCode, difficultyToCode, syncStatusToCode, titleTypeToCode } from "@/lib/games/maimai/codes";
import type { Region } from "@/lib/types";
import type { GameSnapshotData } from "@/lib/games/player-view";

export async function loadReservedMaimaiSnapshot(username: string, region: Region): Promise<GameSnapshotData | null> {
  const data = await getReservedSnapshotData(username, region);
  if (!data) return null;
  return {
    snapshot: { ...data.snapshot, game: "maimai", titleType: titleTypeToCode(data.snapshot.titleType) },
    songs: data.songs.map(song => ({
      ...song,
      difficultyCode: difficultyToCode(song.difficulty),
      typeCode: chartTypeToCode(song.type),
      scoreValue: song.achievement,
      secondaryScore: song.dxScore,
      comboStatus: comboStatusToCode(song.fc),
      syncStatus: syncStatusToCode(song.fs),
      clearStatus: 0,
    })),
    events: [],
  };
}
