import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { CanonicalGameId } from "@/lib/games/ids";
import { testGame } from "@/test/games";
import { SongsCard } from "./songs-card";

vi.mock("@/lib/trpc-client", () => ({ trpc: { maimai: { getChartPercentiles: { useQuery: () => ({ data: undefined }) } } } }));
vi.mock("@/components/games/maimai/song-hover-card", () => ({ SongHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const SNAPSHOT_VERSION: Record<CanonicalGameId, number> = { maimai: 10, chunithm: 9 };

// Forty charts of the snapshot's version and forty of the one before, so both buckets fill.
function snapshot(game: CanonicalGameId): GameSnapshotData {
  const gameVersion = SNAPSHOT_VERSION[game];
  return {
    snapshot: {
      publicId: "test", game, displayName: "Player", rating: game === "maimai" ? 15000 : 1650, fetchedAt: new Date("2026-09-01T00:00:00Z"), gameVersion,
      title: "", titleType: 0, iconUrl: "", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 0, totalPlayCount: 12,
    },
    songs: Array.from({ length: 80 }, (_, i) => ({
      songId: `chart-${i}`, songName: `Song ${i}`, artist: "Artist", cover: "https://example.com/cover.webp", difficultyCode: 3, typeCode: 0,
      level: "14", levelPrecise: 140, genre: "", addedVersion: i < 40 ? gameVersion : gameVersion - 1,
      scoreValue: game === "maimai" ? 1005000 : 1009000, secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0,
    })),
  };
}

async function render(game: CanonicalGameId) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={await loadMessages(game, "en")} timeZone="UTC">
      <GameProvider game={testGame(game, ["jp"])}><SongsCard selectedSnapshotData={snapshot(game)} /></GameProvider>
    </NextIntlClientProvider>,
  );
}

describe("SongsCard", () => {
  it("shows CHUNITHM integer scores and ratings in its B20 and B30 without maimai score units", async () => {
    const markup = await render("chunithm");
    expect(markup).toContain("1,009,000");
    expect(markup).toContain("16.15");
    expect(markup).toContain("New Songs B20");
    expect(markup).toContain("Old Songs B30");
    expect(markup).not.toContain("100.5000%");
    expect(markup).not.toContain("B15");
  });

  it("keeps maimai achievement precision and its B15 and B35 titles", async () => {
    const markup = await render("maimai");
    expect(markup).toContain("100.5000%");
    expect(markup).toContain("New Songs B15");
    expect(markup).toContain("Old Songs B35");
  });
});
