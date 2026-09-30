// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import { testGame } from "@/test/games";
import { waitForRender } from "@/test/react";
import { SongsList } from "./songs-list";
import type { UniqueSong } from "./songs/types";

const catalog = vi.hoisted(() => ({ requested: vi.fn() }));
const song: UniqueSong = {
  parentIds: ["abcdefgh"], index: 0, songName: "CHU chart", artist: "Artist", cover: "https://example.com/cover.webp", type: "standard",
  genre: "ORIGINAL", addedVersion: 4, slug: "chu-chart-standard", aliases: [],
  difficulties: [{ difficulty: "ultima", level: "14+", levelPrecise: 145, noteDesigner: null }],
};
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: { getAllUniqueSongs: {
  useQuery: (input: { game: string }, options: object) => useQuery({
    queryKey: ["catalog", input],
    queryFn: async () => { catalog.requested(input.game); return [song]; },
    ...options,
  }),
} } } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, scroll: _scroll, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { scroll?: boolean; prefetch?: boolean }) =>
    <a href={href} {...props}>{children}</a>,
  usePathname: () => "/db/songs",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/use-infinite-scroll", () => ({ useInfiniteScroll: () => ({ current: null }) }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  container = document.createElement("div");
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.clearAllMocks(); });

it("lists the game's catalog with links to each song while the game has no player region", async () => {
  const messages = await loadMessages("chunithm", "en");
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <GameProvider game={testGame("chunithm", [])}><SongsList /></GameProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  ));
  await waitForRender(() => expect(container.textContent).toContain("CHU chart"));
  expect(catalog.requested).toHaveBeenCalledWith("chunithm");
  expect(container.querySelector('a[href="/db/songs/chu-chart-standard"]')).not.toBeNull();
});
