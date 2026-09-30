// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { RecommendationCard } from "./recommendation-card";
import { GameProvider } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { toFrontendGame, type FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { Flags } from "@/lib/flags";
import messages from "../../../messages/en.json";

const peers = vi.hoisted(() => vi.fn(() => ({ data: undefined, status: "pending", fetchStatus: "idle", error: null })));
vi.mock("@/lib/trpc-client", () => ({ trpc: { maimai: { getRecommendationPeers: { useQuery: peers } } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("@/components/games/maimai/song-hover-card", () => ({ SongHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => null }));
const chart: GameSnapshotData["songs"][number] = {
  songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
  addedVersion: 9, difficultyCode: 4, typeCode: 0, scoreValue: 1000000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0,
};
afterEach(() => vi.clearAllMocks());

async function renderText(game: FrontendGame, data: GameSnapshotData): Promise<string> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={game}>
        <RecommendationCard selectedSnapshotData={data} flags={{ scorePercentile: true } as Flags} region="jp" />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
  const text = container.textContent ?? "";
  await act(async () => root.unmount());
  return text;
}

it("renders CHUNITHM score targets, average rating gains and game-sized buckets without a standard badge", async () => {
  const data: GameSnapshotData = {
    snapshot: { publicId: "snapshot", game: "chunithm", gameVersion: 9, displayName: "Player", rating: 30, fetchedAt: new Date() },
    songs: [chart],
  };
  const text = await renderText({ ...toFrontendGame(getGame("chunithm"), ["jp"]), capabilities: ["scores", "rating"] }, data);
  expect(text).toContain("B20/B30");
  expect(text).toContain("1,000,000");
  expect(text).toContain("1,005,000");
  expect(text).toContain("15.00");
  expect(text).toContain("15.50");
  expect(text).toContain("+0.01");
  expect(text).toContain("ULTIMA");
  expect(text).not.toContain("STANDARD");
  expect(text).not.toContain("B15");
  expect(peers).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enabled: false }));
});

it("renders maimai score targets at compact precision with the floored delta, and the AP target by its label", async () => {
  const master = codeOf("maimai", "difficulty", "master");
  const data: GameSnapshotData = {
    snapshot: { publicId: "snapshot", game: "maimai", gameVersion: 13, displayName: "Player", rating: 0, fetchedAt: new Date() },
    songs: [
      { ...chart, songId: "score", difficultyCode: master, levelPrecise: 131, addedVersion: 13, scoreValue: 994567 },
      { ...chart, songId: "combo", songName: "Other", difficultyCode: master, addedVersion: 13, scoreValue: 1005000 },
    ],
  };
  const text = await renderText(toFrontendGame(getGame("maimai"), ["jp"]), data);
  expect(text).toContain("99.45% → 99.50%");
  expect(text).toContain("+0.05%");
  expect(text).toContain("100.50% → AP");
  expect(text).toContain("B15/B35");
});
