// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame, type FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { Flags } from "@/lib/flags";
import { DataContent } from "./data-content";
import messages from "../../../messages/en.json";

const queries = vi.hoisted(() => ({ eventSteps: vi.fn(), exportSnapshot: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { maimai: {
  getEventStepsByNames: { useQuery: (...args: unknown[]) => { queries.eventSteps(...args); return { data: undefined, isLoading: false }; } },
  getDailyPlaysAvailableDays: { useQuery: () => ({ data: [], isFetching: false }) },
  getPublicDailyPlaysAvailableDays: { useQuery: () => ({ data: [], isFetching: false }) },
  exportSnapshotData: { useQuery: (...args: unknown[]) => { queries.exportSnapshot(...args); return { refetch: vi.fn() }; } },
} } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

// A chart from a version this build does not know yet must not break any maimai tab.
const data: GameSnapshotData = {
  snapshot: { publicId: "public-snapshot", game: "maimai", displayName: "Player", rating: 15000, gameVersion: 13, fetchedAt: new Date("2026-09-01T00:00:00Z") },
  songs: [{
    songId: "AbCd_123:j999", songName: "Future Song", artist: "Artist", cover: "", genre: "", level: "14", levelPrecise: 140,
    addedVersion: 999, difficultyCode: 3, typeCode: 1, scoreValue: 1005000, secondaryScore: null, comboStatus: 0, syncStatus: 0, clearStatus: 0,
  }],
  events: [{ name: "Stored Area", eventType: "area", currentDistance: null, state: null, imageUrl: "https://example.com/area.png" }],
};
const flags = { eventsCard: true } as Flags;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderTab(initialTab: string) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={toFrontendGame(getGame("maimai"), ["jp"])}>
        <DataContent region="jp" selectedSnapshotData={data} isLoading={false} visitableProfileAt={null} initialTab={initialTab} visitedBySelf flags={flags} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
  await act(() => vi.dynamicImportSettled());
}

it("renders stored events with missing progress on the map tab", async () => {
  await renderTab("map");
  expect(container.textContent).toContain("Stored Area");
  expect(container.textContent).toContain("0 km");
  expect(container.textContent).toContain(messages.events.notStarted);
  expect(queries.eventSteps).toHaveBeenCalledWith({ names: ["Stored Area"] }, expect.anything());
});

it("builds the export images from the public snapshot id", async () => {
  await renderTab("exportImage");
  const sources = Array.from(container.querySelectorAll("img"), image => image.getAttribute("src"));
  expect(sources).toContain("/api/export-image?snapshotId=public-snapshot");
  expect(container.querySelector('img[alt="maimai-profile-Player.png"]')).not.toBeNull();
});

it("exports the JSON of the public snapshot id", async () => {
  await renderTab("developer");
  expect(queries.exportSnapshot).toHaveBeenCalledWith({ snapshotId: "public-snapshot" }, { enabled: false });
});

async function renderEmpty(game: FrontendGame, visitedBySelf: boolean) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={game}>
        <DataContent region="jp" selectedSnapshotData={null} isLoading={false} visitableProfileAt="alice" profileUsername="alice" visitedBySelf={visitedBySelf} flags={flags} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
}

it("tells a visitor that the player has no records instead of showing the owner's fetch steps", async () => {
  await renderEmpty(toFrontendGame(getGame("chunithm"), ["jp"]), false);
  expect(container.textContent).toContain("alice has no CHUNITHM records yet.");
  expect(container.textContent).not.toContain("fetch button");
});

it("shows the owner how to fetch, or that fetching is not offered", async () => {
  await renderEmpty(toFrontendGame(getGame("chunithm"), ["jp"]), true);
  expect(container.textContent).toContain("Get started by fetching your CHUNITHM data using the fetch button above.");
  await renderEmpty({ ...toFrontendGame(getGame("chunithm"), ["jp"]), capabilities: ["catalog"] }, true);
  expect(container.textContent).toContain("Player fetching for CHUNITHM is not available yet.");
});
