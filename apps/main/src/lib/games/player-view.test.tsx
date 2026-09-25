import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameSnapshotContent } from "@/components/game-snapshot-content";
import messages from "../../../messages/en.json";
import { getPlayerRankings, getSnapshotSelection, type GameSnapshotData } from "./player-view";
import type { CanonicalGameId } from "./types";
import type { FrontendGame } from "./frontend";

function fixture(game: CanonicalGameId): GameSnapshotData {
  return {
    snapshot: { publicId: "test", game, displayName: "Player", rating: game === "maimai" ? 15000 : 1650, fetchedAt: new Date("2026-09-01T00:00:00Z"), gameVersion: 10, totalPlayCount: 12 },
    songs: Array.from({ length: 80 }, (_, i) => ({
      songId: `chart-${i}`, songName: `Song ${i}`, artist: "Artist", cover: "", difficultyCode: 3, typeCode: 0, level: "14", levelPrecise: 140, genre: "", addedVersion: i < 40 ? 10 : 9,
      scoreValue: game === "maimai" ? 1005000 : 1009000, secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0,
    })),
  };
}

function render(game: CanonicalGameId, options?: { showAllScores?: boolean; showScoreDetails?: boolean; showPlayCounts?: boolean }) {
  const descriptor: FrontendGame = { id: game, enabled: false, displayName: game, productName: game === "maimai" ? "tomomai" : "tomochu", regions: ["jp"], capabilities: ["scores", "rating", "rankings"] };
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameSnapshotContent game={descriptor} data={fixture(game)} {...options} /></NextIntlClientProvider>);
}

describe("normalized player views", () => {
  it("keeps unknown-metadata charts in all scores but excludes them from ratings", () => {
    const data = fixture("chunithm");
    data.songs = data.songs.slice(0, 3);
    data.songs[0].levelPrecise = null;
    data.songs[1].addedVersion = null;
    const rankings = getPlayerRankings("chunithm", data);
    expect(rankings.newScores.map(song => song.songId)).toEqual(["chart-2"]);
    expect(data.songs).toHaveLength(3);
    const descriptor: FrontendGame = { id: "chunithm", enabled: false, displayName: "CHUNITHM", productName: "tomochu", regions: ["jp"], capabilities: ["scores", "rating", "rankings"] };
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameSnapshotContent game={descriptor} data={data} initialView="songs" /></NextIntlClientProvider>);
    expect(markup).toContain("Song 0");
    expect(markup).toContain("Song 1");
    expect(markup).toContain("Song 2");
  });
  it("selects each game's buckets without changing the source scores", () => {
    for (const [game, sizes] of [["maimai", [15, 35]], ["chunithm", [20, 30]]] as const) {
      const data = fixture(game);
      const rankings = getPlayerRankings(game, data);
      expect([rankings.newScores.length, rankings.oldScores.length]).toEqual(sizes);
      expect(data.songs).toHaveLength(80);
    }
  });
  it("renders CHUNITHM integer scores and rating without maimai score units", () => {
    const markup = render("chunithm");
    expect(markup).toContain("1,009,000");
    expect(markup).toContain("16.50");
    expect(markup).toContain("B20");
    expect(markup).toContain("B30");
    expect(markup).not.toContain("100.5000%");
    expect(markup).not.toContain("B15");
  });
  it("preserves maimai percentage precision and ranking labels", () => {
    const markup = render("maimai");
    expect(markup).toContain("100.5000%");
    expect(markup).toContain("B15");
    expect(markup).toContain("B35");
  });
  it("does not expose private score controls, statuses or play counts", () => {
    const markup = render("chunithm", { showAllScores: false, showScoreDetails: false, showPlayCounts: false });
    expect(markup).not.toContain("All scores");
    expect(markup).not.toContain(">Status<");
    expect(markup).not.toContain("Play count");
  });
  it("keeps historical selection until refresh clears it, then follows the newest snapshot", () => {
    const snapshots = [{ id: "new-fetch" }, { id: "history" }];
    expect(getSnapshotSelection(snapshots, "history")).toBe("history");
    expect(getSnapshotSelection(snapshots, null)).toBe("new-fetch");
  });
  it("drops a stale snapshot selection when its game or region list changes", () => {
    expect(getSnapshotSelection([], "old-game-id")).toBeNull();
    const snapshots = [{ id: "new-game-id" }];
    expect(getSnapshotSelection(snapshots, "old-game-id")).toBe("new-game-id");
  });
});
