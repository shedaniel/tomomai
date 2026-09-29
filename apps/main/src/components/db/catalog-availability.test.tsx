import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } };
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import messages from "../../../messages/en.json";

const fixture = vi.hoisted(() => ({
  game: { id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: false, regions: [], capabilities: ["catalog", "rankings", "rating"] },
  songs: [{ parentIds: ["abcdefgh"], index: 0, songName: "CHU chart", artist: "Artist", cover: "https://example.com/cover.webp", type: "standard", genre: "ORIGINAL", addedVersion: 4, slug: "chu-chart-standard", aliases: [], difficulties: [{ difficulty: "ultima", level: "14+", levelPrecise: 145, noteDesigner: null }] }],
  catalog: vi.fn(), details: vi.fn(), scores: vi.fn(),
}));
vi.mock("@/lib/games/frontend-server", () => ({ getFrontendGame: () => fixture.game }));
vi.mock("@/server/queries/songs-cache", () => ({ getAllUniqueSongsCached: (game: string) => { fixture.catalog(game); return Promise.resolve(fixture.songs); }, getSongDetailsCached: fixture.details }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/seo", () => ({ breadcrumbJsonLd: () => ({}), openGraphLocales: () => ({}), localizePath: (value: string) => value, buildAlternates: async () => ({}), ogImageUrl: (value: string) => value }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));
vi.mock("@/components/inline-not-found", () => ({ InlineNotFound: () => <p>Unavailable route</p> }));
vi.mock("@/components/db/songs/song-detail-content", () => ({ SongDetailContent: ({ initialData }: { initialData: { songName: string } }) => <p>{initialData.songName}</p> }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href, scroll, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { scroll?: boolean; prefetch?: boolean }) => <a href={href} {...props}>{children}</a>, usePathname: () => "/db/songs", useRouter: () => ({ push: vi.fn() }), getPathname: ({ href }: { href: string }) => href }));
vi.mock("@/hooks/use-infinite-scroll", () => ({ useInfiniteScroll: () => ({ current: null }) }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { id: "viewer" } } }) }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { useUtils: () => ({ user: { getSongScores: { reset: vi.fn() } } }), user: { getSongDetails: { useQuery: () => ({ data: undefined, isLoading: false }) }, getSongScores: { useQuery: (input: { game: string }, options: object) => useQuery({ queryKey: ["scores", input], queryFn: async () => { fixture.scores(input.game); return { viewerId: "viewer", userScores: {} }; }, ...options }) }, getAllUniqueSongs: { useQuery: (input: { game: string }, options: object) => useQuery({ queryKey: ["catalog", input], queryFn: async () => { fixture.catalog(input.game); return fixture.songs; }, ...options }) } } } }));

import DbTypePage from "@/app/[locale]/db/[type]/page";
import DetailSlotPage from "@/app/[locale]/db/@detail/[type]/[slug]/page";
import DbSlugPage from "@/app/[locale]/db/[type]/[slug]/page";
import { SongsList } from "./songs-list";
import { GameUnavailable } from "@/components/player/game-unavailable";
import type { FrontendGame } from "@/lib/games/frontend";

afterEach(() => { vi.clearAllMocks(); fixture.game.id = "chunithm"; });
describe("catalog independent of player rollout", () => {
  it.each(["maimai", "chunithm"])("renders %s catalog list and linked detail independently of player rollout", async game => {
    fixture.game.id = game;
    fixture.details.mockResolvedValue({ songName: "CHU detail" });
    const list = renderToStaticMarkup(await DbTypePage({ params: Promise.resolve({ type: "songs" }) }));
    expect(list).toContain('"numberOfItems":1');
    const params = Promise.resolve({ type: "songs", slug: "chu-chart-standard" });
    const detail = renderToStaticMarkup(await DetailSlotPage({ params }));
    expect(detail).toContain("CHU detail");
    expect(fixture.details).toHaveBeenCalledWith(game, "CHU chart", "standard", undefined, "Artist", ["abcdefgh"]);
    expect(renderToStaticMarkup(await DbSlugPage({ params }))).toContain('"name":"CHU chart"');
    expect(fixture.catalog).toHaveBeenCalledWith(game);
  });
  it("fetches and displays ingested CHU charts with no configured player regions", async () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
    const { SongDetailContent } = await vi.importActual<typeof import("./songs/song-detail-content")>("./songs/song-detail-content");
    const detailFor = (type: string) => <SongDetailContent songName="CHU chart" slug={`chu-chart-${type}`} type={type} initialData={{ parentIds: ["abcdefgh"], songName: "CHU detail", artist: "Artist", cover: "https://example.com/cover.webp", type, genre: "ORIGINAL", bpm: null, addedVersion: 4, regions: [] }} />;
    const detail = detailFor("standard");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const container = document.createElement("div"); const root = createRoot(container);
    try {
      await act(async () => root.render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={fixture.game as FrontendGame}><SongsList />{detail}</GameProvider></NextIntlClientProvider></QueryClientProvider>));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(fixture.catalog).toHaveBeenCalledWith("chunithm");
      expect(container.textContent).toContain("CHU chart");
      expect(container.textContent).toContain("CHU detail");
      expect(container.textContent).not.toContain("STANDARD");
      expect(fixture.scores).not.toHaveBeenCalled();
      expect(container.querySelector('a[href="/db/songs/chu-chart-standard"]')).not.toBeNull();
      await act(async () => root.render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={{ ...fixture.game, id: "maimai", productName: "tomomai", enabled: true, regions: ["jp"], capabilities: ["catalog", "scores"] }}>{detailFor("std")}</GameProvider></NextIntlClientProvider></QueryClientProvider>));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(fixture.scores).toHaveBeenCalledWith("maimai");
      expect(container.querySelector('img[alt="STD"]')).not.toBeNull();
    } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); vi.unstubAllGlobals(); }
  });
  it("offers the catalog from the unavailable-player landing screen", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><GameProvider game={fixture.game as FrontendGame}><GameUnavailable /></GameProvider></NextIntlClientProvider>);
    expect(html).toContain('href="/db/songs"');
    expect(html).toContain("CHUNITHM");
  });
});
