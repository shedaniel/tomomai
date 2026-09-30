import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId, loads: [] as Promise<void>[] }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async (namespace: string) => createTranslator({
      locale: "en",
      messages: await loadMessages(current.game, "en"),
      namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), ["intl", "jp"]) };
});
vi.mock("@/server/queries/songs-cache", () => ({ getAllUniqueSongsCached: async () => [{ slug: "song" }] }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<ComponentType>) => {
    let Loaded: ComponentType | null = null;
    current.loads.push(load().then(component => { Loaded = component; }));
    return function Dynamic() {
      return Loaded ? <Loaded /> : null;
    };
  },
}));
vi.mock("@/components/games/maimai/db/stats-database", () => ({ StatsDatabase: () => <p>maimai statistics</p> }));
vi.mock("@/components/games/maimai/db/events-database", () => ({ EventsDatabase: () => <p>maimai events</p> }));
vi.mock("@/components/games/maimai/db/arcades", () => ({ ArcadesMap: () => <p>arcade map</p> }));

import DbTypePage, { generateMetadata } from "./page";

const params = (type: string) => ({ params: Promise.resolve({ type }) });
const render = async (type: string) => renderToStaticMarkup(await DbTypePage(params(type)));
const noindex = { robots: { index: false, follow: false } };

beforeAll(async () => { await Promise.all(current.loads); });
beforeEach(() => { current.game = "maimai"; });

describe("catalog section pages", () => {
  it.each([
    { type: "stats", content: "maimai statistics" },
    { type: "events", content: "maimai events" },
    { type: "arcades", content: "arcade map" },
  ])("renders the maimai $type section", async ({ type, content }) => {
    expect(await render(type)).toContain(content);
  });

  it("renders the songs collection for every game", async () => {
    for (const game of ["maimai", "chunithm"] as const) {
      current.game = game;
      expect(await render("songs")).toContain('"numberOfItems":1');
    }
  });

  it.each([
    { game: "chunithm", type: "stats" },
    { game: "chunithm", type: "events" },
    { game: "chunithm", type: "arcades" },
    { game: "maimai", type: "coming-soon" },
  ] as const)("shows $game $type as a page that does not exist and keeps it out of the index", async ({ game, type }) => {
    current.game = game;
    const html = await render(type);
    expect(html).toContain("Page not found");
    expect(html).not.toContain("Song not found");
    expect(await generateMetadata(params(type))).toEqual(noindex);
  });

  it("indexes the sections the game offers with copy naming the game", async () => {
    const stats = await generateMetadata(params("stats"));
    expect(stats.robots).toBeUndefined();
    expect(stats.description).toMatch(/^Explore aggregate maimai DX statistics/);
    expect((await generateMetadata(params("events"))).description).toBe("Browse all maimai DX tour events and their rewards");
    current.game = "chunithm";
    expect((await generateMetadata(params("songs"))).robots).toBeUndefined();
  });
});
