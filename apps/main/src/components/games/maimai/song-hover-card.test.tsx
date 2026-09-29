// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { loadMessages } from "@/i18n/messages";
import { SongHoverCard } from "./song-hover-card";
import messages from "../../../../messages/en.json";

const maimaiMessages = await loadMessages("maimai", "en");

const songDetails = vi.hoisted(() => vi.fn(() => ({ data: undefined, isLoading: true })));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getSimpleSongDetails: { useQuery: () => ({ data: { slug: "song", genre: "POPS", bpm: 150, addedVersion: 13 }, isLoading: false }) },
  getSongDetails: { useQuery: songDetails },
} } }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("opens the chart details of the hovered score's own parent song", async () => {
  const score = { songId: "AbCd_123:j13", songName: "Same Title", artist: "Artist", cover: "", difficultyCode: 3, typeCode: 1 };
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={maimaiMessages} timeZone="UTC">
      <GameProvider game={toFrontendGame(getGame("maimai"), ["jp"])}>
        <SongHoverCard score={score}><button type="button">row</button></SongHoverCard>
      </GameProvider>
    </NextIntlClientProvider>,
  ));
  await act(async () => {
    container.querySelector("button")?.focus();
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  const viewCharts = Array.from(document.querySelectorAll("button")).find(button => button.textContent === messages.db.songs.detail.viewCharts);
  expect(viewCharts).toBeDefined();
  await act(async () => viewCharts?.click());
  expect(songDetails).toHaveBeenLastCalledWith(
    { game: "maimai", songName: "Same Title", artist: "Artist", type: "dx", parentIds: ["AbCd_123"] },
    expect.objectContaining({ enabled: true }),
  );
});
