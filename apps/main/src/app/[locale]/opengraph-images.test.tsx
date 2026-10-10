import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const fixture = vi.hoisted(() => ({ fetchProfile: vi.fn() }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  const { resolveFrontendGame } = await import("@/lib/games/frontend-config");
  return {
    getTranslations: async ({ locale, namespace }: { locale: "en"; namespace: string }) => createTranslator({
      locale,
      messages: await loadMessages(resolveFrontendGame(process.env.FRONTEND_GAME), locale),
      namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/i18n/og-locale", () => ({ getOGImageLocales: async () => ["en"] }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "site.test" }) }));
vi.mock("@/server/queries/songs-cache", () => ({
  getAllUniqueSongsCached: async (game: CanonicalGameId) => [{
    slug: "song",
    songName: "Song",
    artist: "Artist",
    genre: "ORIGINAL",
    cover: "https://covers.test/song.webp",
    addedVersion: 1,
    ...(game === "maimai"
      ? { type: "dx", difficulties: [{ difficulty: "master", levelPrecise: 139 }, { difficulty: "remaster", levelPrecise: 145 }] }
      : { type: "standard", difficulties: [{ difficulty: "master", levelPrecise: 139 }, { difficulty: "ultima", levelPrecise: 148, levelPreciseEstimated: true }] }),
  }],
}));
vi.mock("@/server/queries/game-profile", () => ({ fetchPublicGameProfileHeader: fixture.fetchProfile }));
// Every image reads the database through a query module, so none can bypass its game scoping and privacy rules.
vi.mock("@/lib/db", () => { throw new Error("An OpenGraph image imported the database client"); });

import HomeImage from "./opengraph-image";
import DatabaseImage from "./db/opengraph-image";
import SectionImage from "./db/[type]/opengraph-image";
import SongImage from "./db/[type]/[slug]/opengraph-image";
import ProfileImage from "./profile/[username]/[region]/opengraph-image";

const id = Promise.resolve("en");
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const IMAGES = {
  home: () => HomeImage({ id }),
  database: () => DatabaseImage({ id }),
  songs: () => SectionImage({ params: Promise.resolve({ type: "songs" }), id }),
  song: () => SongImage({ params: Promise.resolve({ type: "songs", slug: "song" }), id }),
  "unknown song": () => SongImage({ params: Promise.resolve({ type: "songs", slug: "missing" }), id }),
  profile: () => ProfileImage({ params: Promise.resolve({ username: "player", region: "intl" }), id }),
  "profile in another region": () => ProfileImage({ params: Promise.resolve({ username: "player", region: "cn" }), id }),
};

function serve(game: CanonicalGameId) {
  vi.stubEnv("FRONTEND_GAME", game);
  vi.stubEnv(`NEXT_PUBLIC_ENABLED_${game.toUpperCase()}_REGIONS`, "intl,jp");
  fixture.fetchProfile.mockResolvedValue({
    profile: { id: "user" },
    snapshot: { game, displayName: "Player", title: "Title", rating: game === "maimai" ? 15432 : 1650, gameVersion: 1, iconUrl: "https://icons.test/player.png" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(["chunithm", "maimai"] as const)("%s page images", game => {
  beforeEach(() => serve(game));

  it.each(Object.keys(IMAGES) as (keyof typeof IMAGES)[])("draws the %s image", async name => {
    const response = await IMAGES[name]();
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 4)]).toEqual(PNG_SIGNATURE);
  });
});
