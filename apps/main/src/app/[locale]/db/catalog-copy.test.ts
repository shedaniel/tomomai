import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/locale";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({ locale, namespace }: { locale: Locale; namespace?: string }) => createTranslator({
      locale,
      messages: await loadMessages(current.game, locale),
      namespace,
      onError(error) { throw error; },
    }),
  };
});

import { getCatalogSectionCopy, getDatabaseCopy } from "./catalog-copy";

function copy(game: CanonicalGameId, locale: Locale, section: "songs" | "stats") {
  current.game = game;
  return getCatalogSectionCopy(section, locale, { brand: getGame(game).brand });
}

describe("catalog copy", () => {
  it.each([
    { game: "maimai", locale: "ja", title: "楽曲データベース | maimai でらっくす", description: /^maimai でらっくすの楽曲を/ },
    { game: "maimai", locale: "en", title: "Songs Database | maimai DX", description: /^Browse and search all maimai DX songs/ },
    { game: "chunithm", locale: "ja", title: "楽曲データベース | CHUNITHM", description: /^CHUNITHMの楽曲を/ },
  ] as const)("names $game in its $locale songs database copy", async ({ game, locale, title, description }) => {
    expect(await copy(game, locale, "songs")).toEqual({ title, description: expect.stringMatching(description) });
    current.game = game;
    expect(await getDatabaseCopy(locale, { brand: getGame(game).brand })).toEqual({ title, description: expect.stringMatching(description) });
  });

  it("keeps the brand's display name in the other sections", async () => {
    expect((await copy("maimai", "ja", "stats"))?.description).toMatch(/maimai DX の統計/);
  });
});
