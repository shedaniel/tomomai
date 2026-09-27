// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { RecommendationCard } from "./recommendation-card";
import { GameProvider } from "./providers/game-provider";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { Flags } from "@/lib/flags";
import { generateRecommendations } from "@/server/queries/recommendations";
import { applyRecommendationFilters, createRecommendationFilterLabel } from "./filter-panel";
import messages from "../../messages/en.json";

const peers = vi.hoisted(() => vi.fn(() => ({ data: undefined, status: "pending", fetchStatus: "idle", error: null })));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: { getRecommendationPeers: { useQuery: peers } } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("./song-hover-card", () => ({ SongHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./cover-image", () => ({ CoverImage: () => null }));
const data: GameSnapshotData = {
  snapshot: { publicId: "snapshot", game: "chunithm", gameVersion: 9, displayName: "Player", rating: 30, fetchedAt: new Date() },
  songs: [{ songId: "chart", songName: "Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
    addedVersion: 9, difficultyCode: 4, typeCode: 0, scoreValue: 1000000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 }],
};
afterEach(() => vi.clearAllMocks());
it("renders CHUNITHM score targets, average rating gains and game-sized buckets without a standard badge", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={{ id: "chunithm", productName: "tomochu", displayName: "CHUNITHM", enabled: true, regions: ["jp"], capabilities: ["scores", "rating"] }}>
        <RecommendationCard selectedSnapshotData={data} flags={{ scorePercentile: true } as Flags} region="jp" />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
  expect(container.textContent).toContain("B20/B30");
  expect(container.textContent).toContain("1,000,000");
  expect(container.textContent).toContain("1,005,000");
  expect(container.textContent).toContain("15.00");
  expect(container.textContent).toContain("15.50");
  expect(container.textContent).toContain("+0.01");
  expect(container.textContent).toContain("ULTIMA");
  expect(container.textContent).not.toContain("STANDARD");
  expect(container.textContent).not.toContain("B15");
  expect(peers).toHaveBeenCalledWith(expect.objectContaining({ game: "chunithm" }), expect.objectContaining({ enabled: false }));
  await act(async () => root.unmount());
});

it("filters CHUNITHM recommendations by their real score target and catalog display level", () => {
  const recommendations = generateRecommendations({ ...data, songs: [{ ...data.songs[0], level: "14+" }] });
  const filtered = applyRecommendationFilters(recommendations, [{ type: "difficulty", value: "ultima" }, { type: "achievement", value: "1007500" }, { type: "level", value: "14+" }]);
  expect(filtered).toHaveLength(1);
  expect(filtered[0].targetRating).toBe(1600);
  expect(createRecommendationFilterLabel({ type: "achievement", value: "1007500" }, { new: "New", old: "Old" }, "chunithm")).toBe("SSS");
  expect(createRecommendationFilterLabel({ type: "target", value: "1600 - 1609" }, { new: "New", old: "Old" }, "chunithm")).toBe("16.00 - 16.09");
});
