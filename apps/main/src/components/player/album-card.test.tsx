// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import { testGame } from "@/test/games";
import { AlbumCard } from "./album-card";

const album = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/hooks/use-infinite-scroll", () => ({ useInfiniteScroll: () => ({ current: null }) }));
vi.mock("@/lib/trpc-client", () => ({ trpc: {
  useUtils: () => ({ user: { getUserAlbums: { invalidate: vi.fn() } } }),
  user: {
    getUserAlbums: { useQuery: () => ({ ...album, error: null, isLoading: false, isFetching: false }) },
    deleteAlbum: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  container = document.createElement("div"); root = createRoot(container);
  album.data = { albums: [{ id: "1", songName: "Album song", artist: "Artist", cover: "https://example.com/cover.webp", difficultyCode: 4, typeCode: 0, levelPrecise: 150, level: "15", takenAt: "2026-09-01", imageKey: "albums/1.avif" }], hasMore: false };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("shows each maimai album's photo instead of the empty state", async () => {
  const messages = await loadMessages("maimai", "en");
  await act(async () => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={testGame("maimai", ["jp"])}><AlbumCard region="jp" /></GameProvider></NextIntlClientProvider>));
  expect(container.textContent).toContain("Album song");
  expect(container.querySelector('img[alt="Album song"]')?.getAttribute("src")).toMatch(/\/albums\/1\.avif$/);
  expect(container.textContent).not.toContain("No albums");
});
