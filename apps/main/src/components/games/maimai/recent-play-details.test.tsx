// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { RecentPlay } from "@/server/queries/recents";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { MaimaiRecentPlayDetails } from "./recent-play-details";
import messages from "../../../../messages/en.json";

vi.mock("@/lib/trpc-client", () => ({ trpc: { user: { getSimpleSongDetails: { useQuery: () => ({ data: undefined, isLoading: true }) } } } }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

const judgements = (prefix: "tap" | "hold" | "slide" | "touch" | "break", criticalPerfect: number) => ({
  [`${prefix}CPerfect`]: criticalPerfect, [`${prefix}Perfect`]: 0, [`${prefix}Great`]: 0, [`${prefix}Good`]: 0, [`${prefix}Miss`]: 0,
});
const play = {
  songId: "song", scoreValue: 1010000, secondaryScore: 1500, maxDxScore: 1500, rating: 337, ratingChange: 2,
  combo: 500, maxCombo: 500, fastCount: 3, lateCount: 1, venue: null,
  ...judgements("tap", 300), ...judgements("hold", 100), ...judgements("slide", 60), ...judgements("touch", 20), ...judgements("break", 20),
} as unknown as RecentPlay;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

async function render(isDetailed: boolean) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={{ ...toFrontendGame(getGame("maimai"), ["intl"]), capabilities: ["recents"] }}>
        <MaimaiRecentPlayDetails play={play} isExpanded isDetailed={isDetailed} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
}

it("renders the maimai DX score, rating and judgement breakdown for a detailed play", async () => {
  await render(true);
  expect(container.textContent).toContain("DX1500");
  expect(container.textContent).toContain("337");
  expect(container.textContent).toContain("Critical Perfect");
  expect(container.textContent).toContain("Break");
  expect(container.textContent).not.toContain(messages.recentPlays.detailsNotFetched);
});

it("asks for another sync when the play has no fetched details", async () => {
  await render(false);
  expect(container.textContent).toContain(messages.recentPlays.detailsNotFetched);
  expect(container.textContent).not.toContain("Critical Perfect");
});
