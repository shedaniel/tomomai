import { describe, expect, it } from "vitest";
import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import { fromMaimaiScore, toMaimaiChart, toMaimaiResult, toMaimaiSnapshotHeader } from "./legacy-view";

describe("maimai legacy view", () => {
  it("decodes the header codes and fills the legacy defaults for fields a snapshot may leave out", () => {
    const header = toMaimaiSnapshotHeader({
      publicId: "snap", game: "maimai", displayName: "Player", rating: 15000, gameVersion: 13, fetchedAt: new Date("2026-09-01T00:00:00Z"),
      title: "Title", titleType: 4, iconUrl: "icon.png", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: null, totalPlayCount: null,
    });
    expect(header).toMatchObject({ id: "snap", titleType: "rainbow", title: "Title", iconUrl: "icon.png", courseRankUrl: "", classRankUrl: "", stars: 0, versionPlayCount: 0, totalPlayCount: 0 });
  });

  it("decodes chart codes and a missing DX score to the legacy values", () => {
    expect(toMaimaiChart({ difficultyCode: 3, typeCode: 1 })).toEqual({ difficulty: "master", type: "dx" });
    expect(toMaimaiResult({ scoreValue: 1005000, secondaryScore: null, comboStatus: 4, syncStatus: 3 })).toEqual({ achievement: 1005000, dxScore: 0, fc: "ap+", fs: "fs+" });
  });

  it("maps every combo and sync status to the legacy keys and back", () => {
    MAIMAI_CODES.comboStatus.forEach((fc, comboStatus) => {
      MAIMAI_CODES.syncStatus.forEach((fs, syncStatus) => {
        const codes = { scoreValue: 1005000, secondaryScore: 321, comboStatus, syncStatus };
        const legacy = toMaimaiResult(codes);
        expect(legacy).toEqual({ achievement: 1005000, dxScore: 321, fc, fs });
        expect(fromMaimaiScore(legacy)).toEqual(codes);
      });
    });
  });
});
