import { expect, it } from "vitest";
import type { GamePlayerScore, GameSnapshot } from "@/lib/games/player-view";
import { toMaimaiExport } from "./export";

const header = (gameVersion: number): GameSnapshot => ({
  publicId: "snapshot", game: "maimai", displayName: "Player", rating: 15000, gameVersion, fetchedAt: new Date("2026-09-01T00:00:00Z"),
  title: "Title", titleType: 0, iconUrl: "", courseRankUrl: "course.png", classRankUrl: "class.png", stars: 3, versionPlayCount: 0, totalPlayCount: 0,
});

const score = (songName: string, overrides: Partial<GamePlayerScore>): GamePlayerScore => ({
  songId: `${songName}:j12`, songName, artist: "Artist", cover: "", genre: "", level: "13", levelPrecise: 130, addedVersion: 12,
  difficultyCode: 3, typeCode: 1, scoreValue: 1000000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0,
  ...overrides,
});

it.each([
  { region: "cn", gameVersion: 11, addedVersions: [-9, 1], snapshotName: "maimai DX PRiSM PLUS", songNames: ["ORANGE", "DX PLUS"] },
  { region: "intl", gameVersion: 13, addedVersions: [14], snapshotName: "maimai DX CiRCLE PLUS", songNames: ["MAGiCAL"] },
] as const)("labels $region export versions that were never released in the snapshot region", ({ region, gameVersion, addedVersions, snapshotName, songNames }) => {
  const exported = toMaimaiExport({
    region,
    snapshot: header(gameVersion),
    songs: addedVersions.map((addedVersion, index) => score(`Song ${index}`, { addedVersion, scoreValue: 1000000 - index })),
  });
  expect(exported.metadata).toMatchObject({ region, gameVersion: snapshotName });
  expect(exported.songs.map(song => song.gameVersion)).toEqual(songNames);
});

it("exports scores in rating order with each chart's integer rating and legacy keys", () => {
  const exported = toMaimaiExport({
    region: "jp",
    snapshot: header(12),
    songs: [
      score("C", { levelPrecise: 131, typeCode: 0 }),
      score("B", { scoreValue: 1005000 }),
      score("A", { scoreValue: 1005000, comboStatus: 3, syncStatus: 5 }),
    ],
  });
  expect(exported.songs.map(song => [song.songName, song.rating, song.difficulty, song.type, song.fc, song.fs])).toEqual([
    ["A", 293, "master", "dx", "ap", "fdx+"],
    ["B", 292, "master", "dx", "none", "none"],
    ["C", 282, "master", "std", "none", "none"],
  ]);
});
