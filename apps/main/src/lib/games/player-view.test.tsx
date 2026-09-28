import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { SongsCard } from "@/components/songs-card";
import { GameProvider } from "@/components/providers/game-provider";
import { toPublicGameSnapshot } from "./public-player";
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: { getChartPercentiles: { useQuery: () => ({ data: undefined }) } } } }));
vi.mock("@/components/song-hover-card", () => ({ SongHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import messages from "../../../messages/en.json";
import { type GameSnapshotData } from "./player-view";
import type { CanonicalGameId } from "./types";
import type { FrontendGame } from "./frontend";

function fixture(game: CanonicalGameId): GameSnapshotData {
  return {
    snapshot: { publicId: "test", game, displayName: "Player", rating: game === "maimai" ? 15000 : 1650, fetchedAt: new Date("2026-09-01T00:00:00Z"), gameVersion: 10, totalPlayCount: 12 },
    songs: Array.from({ length: 80 }, (_, i) => ({
      songId: `chart-${i}`, songName: `Song ${i}`, artist: "Artist", cover: "https://example.com/cover.webp", difficultyCode: 3, typeCode: 0, level: "14", levelPrecise: 140, genre: "", addedVersion: i < 40 ? 10 : 9,
      scoreValue: game === "maimai" ? 1005000 : 1009000, secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0,
    })),
  };
}

function render(game: CanonicalGameId) {
  const descriptor: FrontendGame = { id: game, enabled: false, displayName: game, productName: game === "maimai" ? "tomomai" : "tomochu", regions: ["jp"], capabilities: ["scores", "rating", "rankings"] };
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={descriptor}><SongsCard selectedSnapshotData={fixture(game)} /></GameProvider></NextIntlClientProvider>);
}

describe("normalized player views", () => {
  it("renders CHUNITHM integer scores and rating without maimai score units", () => {
    const markup = render("chunithm");
    expect(markup).toContain("1,009,000");
    expect(markup).toContain("16.15");
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
  it("preserves the private maimai AP bonus at the production score-card boundary", () => {
    const data = fixture("maimai");
    data.snapshot.gameVersion = 14;
    data.songs = [{ ...data.songs[0], addedVersion: 14, comboStatus: 3 }];
    const redacted = toPublicGameSnapshot("maimai", data, { profileShowAllScores: false, profileShowScoreDetails: false, profileShowPlayCounts: false });
    const game: FrontendGame = { id: "maimai", enabled: true, displayName: "maimai", productName: "tomomai", regions: ["jp"], capabilities: ["scores", "rankings"] };
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={game}><SongsCard selectedSnapshotData={redacted} /></GameProvider></NextIntlClientProvider>);
    expect(redacted.songs[0].comboStatus).toBe(0);
    expect(redacted.songs[0].chartRating).toBeCloseTo(316.168);
    expect(html).toContain(">316<");
    expect(html).not.toContain(">AP<");
  });
});
