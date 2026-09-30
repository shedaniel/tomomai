import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const fixture = vi.hoisted(() => ({ fetchProfile: vi.fn(), sharpInputs: [] as unknown[] }));

vi.mock("sharp", async importOriginal => {
  const { default: sharp } = await importOriginal<{ default: (...args: unknown[]) => unknown }>();
  return {
    default: (...args: unknown[]) => {
      fixture.sharpInputs.push(args[0]);
      return sharp(...args);
    },
  };
});

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
vi.mock("@/lib/og", async importOriginal => {
  const og = await importOriginal<typeof import("@/lib/og")>();
  return { ...og, createHomeOGImage: vi.fn(og.createHomeOGImage), createDbOGImage: vi.fn(og.createDbOGImage) };
});
// Every image reads the database through a query module, so none can bypass its game scoping and privacy rules.
vi.mock("@/lib/db", () => { throw new Error("An OpenGraph image imported the database client"); });

import HomeImage, { generateImageMetadata as homeImageMetadata } from "./opengraph-image";
import DatabaseImage from "./db/opengraph-image";
import SectionImage from "./db/[type]/opengraph-image";
import SongImage from "./db/[type]/[slug]/opengraph-image";
import ProfileImage, { generateImageMetadata as profileImageMetadata } from "./profile/[username]/[region]/opengraph-image";
import { createDbOGImage, createHomeOGImage } from "@/lib/og";

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

  it("loads only the profile's public snapshot header through the shared loader", async () => {
    await IMAGES.profile();
    expect(fixture.fetchProfile).toHaveBeenCalledWith(game, "player", "intl");
  });
});

describe("brand chip artwork", () => {
  const artwork = (file: string) => path.join(process.cwd(), "public", file);

  it.each([
    { image: "song", drawn: "icon-db-dark.webp", other: "icon-dark.webp" },
    { image: "profile", drawn: "icon-dark.webp", other: "icon-db-dark.webp" },
  ] as const)("draws the maimai $image chip with $drawn", async ({ image, drawn, other }) => {
    serve("maimai");
    fixture.sharpInputs.length = 0;
    await IMAGES[image]();
    expect(fixture.sharpInputs).toContain(artwork(drawn));
    expect(fixture.sharpInputs).not.toContain(artwork(other));
  });
});

describe("page image text", () => {
  it("names the served brand", async () => {
    serve("chunithm");
    expect((await homeImageMetadata())[0].alt).toBe("tomochu ともチュウ");
    expect((await profileImageMetadata())[0].alt).toBe("CHUNITHM profile");
  });

  it.each([
    { game: "maimai", home: "Track and analyze your maimai DX scores with friends", database: /^Browse and search all maimai DX songs/ },
    { game: "chunithm", home: "Track and analyze your CHUNITHM scores with friends", database: /^Browse and search all CHUNITHM songs/ },
  ] as const)("describes the $game site in its taglines", async ({ game, home, database }) => {
    serve(game);
    vi.mocked(createHomeOGImage).mockClear();
    vi.mocked(createDbOGImage).mockClear();
    await IMAGES.home();
    await IMAGES.database();
    expect(vi.mocked(createHomeOGImage).mock.calls[0][0].tagline).toBe(home);
    expect(vi.mocked(createDbOGImage).mock.calls[0][0].tagline).toMatch(database);
  });
});
