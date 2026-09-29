// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { RecentSongsCard } from "./recent-songs-card";
import { AlbumCard } from "./album-card";
import messages from "../../../messages/en.json";

const state = vi.hoisted(() => ({ recent: { data: undefined as unknown, error: null as unknown }, album: { data: undefined as unknown, error: null as unknown }, loadMore: undefined as undefined | (() => void), offsets: [] as number[] }));
vi.mock("@/hooks/use-infinite-scroll", () => ({ useInfiniteScroll: (callback: () => void) => { state.loadMore = callback; return { current: null }; } }));
vi.mock("@/lib/trpc-client", () => ({ trpc: {
  useUtils: () => ({ user: { getUserAlbums: { invalidate: vi.fn() } } }),
  user: {
    getRecentSongs: { useQuery: (input: { offset: number }) => { state.offsets.push(input.offset); return { ...state.recent, isLoading: false, isFetching: false }; } },
    getPublicRecentSongs: { useQuery: () => ({}) },
    getUserAlbums: { useQuery: () => ({ ...state.album, isLoading: false, isFetching: false }) },
    deleteAlbum: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
const recentPlay = { recentSongId: BigInt(1), songId: "song", songName: "Recent song", artist: "Artist", cover: "https://example.com/cover.webp", difficultyCode: 3, typeCode: 0, levelPrecise: 140, level: "14", playedAt: new Date("2026-09-01"), scoreValue: 1009000, comboStatus: 2, syncStatus: 0, clearStatus: 0, rating: 1650, chunithmDetails: null };

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  state.offsets = []; state.recent.error = null; state.album.error = null;
  container = document.createElement("div"); root = createRoot(container);
  state.recent.data = { recentPlays: [recentPlay], hasMore: true };
  state.album.data = { albums: [{ id: "1", songName: "Album song", artist: "Artist", cover: "https://example.com/cover.webp", difficultyCode: 4, typeCode: 0, levelPrecise: 150, level: "15", takenAt: "2026-09-01", imageKey: "" }], hasMore: false };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(content: React.ReactNode) {
  await act(async () => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={{ id: "chunithm", productName: "tomochu", displayName: "CHUNITHM", enabled: true, regions: ["jp"], capabilities: ["recents", "albums"] }}>{content}</GameProvider></NextIntlClientProvider>));
}
describe("shared optional player panels", () => {
  it("renders CHUNITHM recents through the production list and advances pagination", async () => {
    await render(<RecentSongsCard region="jp" />);
    expect(container.textContent).toContain("Recent song");
    expect(container.textContent).toContain("1,009,000");
    expect(container.textContent).toContain("AJ");
    expect(container.textContent).not.toContain("Click to expand");
    expect(container.textContent).toContain("Not fetched");
    state.recent.data = { recentPlays: [], hasMore: false };
    await act(async () => state.loadMore?.());
    expect(state.offsets.at(-1)).toBe(25);
  });
  it("expands fetched CHUNITHM details with real zeros and percentages over 100", async () => {
    state.recent.data = { recentPlays: [{
      ...recentPlay,
      rating: null,
      chunithmDetails: {
        maxCombo: 0,
        judgments: { justiceCritical: 1200, justice: 0, attack: 0, miss: 0 },
        notePercentages: { tap: 101.01, hold: 100, slide: 0, air: 99.5, flick: 100.5 },
      },
    }], hasMore: false };
    await render(<RecentSongsCard region="jp" />);
    expect(container.textContent).not.toContain("Not fetched");
    expect(container.textContent).not.toContain("Justice Critical");
    const expand = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    expect(expand).not.toBeNull();
    await act(async () => expand?.click());
    const detailValue = (label: string) => Array.from(container.querySelectorAll("dt"))
      .find(element => element.textContent === label)?.nextElementSibling?.textContent;
    expect(container.textContent).toContain("Max combo0");
    expect(detailValue("Justice Critical")).toBe("1200");
    expect(detailValue("Justice")).toBe("0");
    expect(detailValue("Attack")).toBe("0");
    expect(detailValue("Miss")).toBe("0");
    expect(detailValue("Tap")).toBe("101.01%");
    expect(detailValue("Slide")).toBe("0%");
    expect(detailValue("Flick")).toBe("100.5%");
    expect(container.textContent).not.toContain("DX");
    expect(container.textContent).not.toContain("Critical Perfect");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.click());
    expect(container.textContent).not.toContain("Justice Critical");
  });
  it("distinguishes an unavailable album image from an empty album", async () => {
    await render(<AlbumCard region="jp" />);
    expect(container.textContent).toContain("Album song");
    expect(container.textContent).toContain("Image unavailable");
    expect(container.textContent).not.toContain("No albums");
  });
  it("shows a query error instead of pretending recents are empty", async () => {
    state.recent.error = new Error("Unavailable");
    await render(<RecentSongsCard region="jp" />);
    expect(container.textContent).toContain(messages.dataContent.loadError);
    expect(container.textContent).not.toContain("Recent song");
  });
});
