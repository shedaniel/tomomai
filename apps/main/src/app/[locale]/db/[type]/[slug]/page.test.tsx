import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { Locale } from "@/i18n/locale";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId, locale: "en" as Locale, type: "dx" }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async (namespace: string) => createTranslator({
      locale: current.locale,
      messages: await loadMessages(current.game, current.locale),
      namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), ["jp"]) };
});
vi.mock("@/server/queries/songs-cache", () => ({
  getAllUniqueSongsCached: async () => [{ slug: "song", songName: "Song", artist: "Artist", genre: "POPS", type: current.type, cover: "cover.webp" }],
}));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => current.locale }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));

import DbSlugPage, { generateMetadata } from "./page";

const params = Promise.resolve({ type: "songs", slug: "song" });

async function describeSong(game: CanonicalGameId, locale: Locale, type: string) {
  Object.assign(current, { game, locale, type });
  const metadata = await generateMetadata({ params });
  const page = await DbSlugPage({ params });
  const [songJsonLd] = page.props.children;
  return { description: metadata.description, jsonLd: JSON.parse(songJsonLd.props.dangerouslySetInnerHTML.__html).description };
}

describe("song page SEO", () => {
  beforeEach(() => Object.assign(current, { game: "maimai", locale: "en", type: "dx" }));

  it("names a maimai chart once, with its localized chart type", async () => {
    expect(await describeSong("maimai", "en", "dx")).toEqual({
      description: "View detailed information about \"Song\" by Artist. maimai でらっくす DX chart • POPS",
      jsonLd: "maimai でらっくす DX chart",
    });
    expect((await describeSong("maimai", "ja", "std")).jsonLd).toBe("maimai でらっくす スタンダード 譜面");
  });

  it("names a CHUNITHM chart by its game alone", async () => {
    const { description, jsonLd } = await describeSong("chunithm", "en", "standard");
    expect(description).toBe("View detailed information about \"Song\" by Artist. CHUNITHM chart • POPS");
    expect(jsonLd).toBe("CHUNITHM chart");
  });
});
