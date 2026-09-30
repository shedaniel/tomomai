// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import type { FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { GameSnapshotSummary } from "@/lib/games/player-view";
import { DataBanner } from "./data-banner";
import messages from "../../../messages/en.json";
import { testGame } from "@/test/games";

vi.mock("@/lib/trpc-client", () => ({ trpc: { maimai: { getAvailableVersionsForCopy: { useQuery: () => ({ data: undefined, isLoading: false }) } } } }));

const snapshot: GameSnapshotSummary = { publicId: "latest", fetchedAt: new Date("2026-09-01"), gameVersion: 13, rating: 15000, displayName: "Player", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 0, totalPlayCount: 0 };

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });

async function render(game: FrontendGame) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={game}>
        <DataBanner region="jp" snapshots={[snapshot]} selectedSnapshot="latest" onSnapshotChange={vi.fn()} onDeleteSnapshot={vi.fn()}
          onFetchData={vi.fn()} isFetching={false} currentSession={null} onCopySnapshot={vi.fn()} isCopying={false} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
}

it("offers the snapshot copy only to a game with the capability", async () => {
  await render(testGame("maimai", ["jp"]));
  expect(container.querySelector('button[title="More options"]')).not.toBeNull();
  expect(container.textContent).toContain(messages.dataBanner.fetchNewData);

  await render(testGame("chunithm", ["jp"]));
  expect(container.querySelector('button[title="More options"]')).toBeNull();
  expect(container.textContent).toContain(messages.dataBanner.fetchNewData);
});

it("explains that a game without score fetching cannot fetch", async () => {
  await render(testGame("chunithm", []));
  expect(container.querySelector('button[title="More options"]')).toBeNull();
  expect(container.textContent).not.toContain(messages.dataBanner.fetchNewData);
  expect(container.textContent).toContain(messages.dataContent.fetchUnavailable.replace("{game}", getGame("chunithm").brand.displayName));
});
