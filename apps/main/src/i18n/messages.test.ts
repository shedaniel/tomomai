import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/locale";
import { CANONICAL_GAME_IDS, type CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import { loadMessages } from "./messages";

type Messages = { [key: string]: Messages | string };

function strings(messages: Messages, prefix = ""): [string, string][] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : strings(value, path);
  });
}

function readMessages(file: string): Messages {
  return JSON.parse(readFileSync(new URL(`../../messages/${file}.json`, import.meta.url), "utf8")) as Messages;
}

const keys = (messages: Messages) => strings(messages).map(([key]) => key);

// Copy every site shares that still names tomomai: the API all sites use is the tomomai API, and the rest
// belongs to features only maimai offers.
const MAIMAI_BRAND_ON_EVERY_SITE = new Set([
  "settings.developer.apiKeys.description",
  "settings.developer.apiKeys.emptySuffix",
  "settings.developer.createDialog.description",
  "settings.albumPrivacy.noteText",
  "db.posts.list.description",
]);

function brandNames(game: CanonicalGameId): RegExp {
  const { productName, japaneseName } = getGame(game).brand;
  return new RegExp(`${productName}|${japaneseName}`, "i");
}

describe("per-game messages", () => {
  it.each(locales)("keeps tomomai and a made-up NET name out of the CHUNITHM site in %s", async locale => {
    const leaks = strings(await loadMessages("chunithm", locale) as Messages)
      .filter(([key, value]) => (brandNames("maimai").test(value) && !MAIMAI_BRAND_ON_EVERY_SITE.has(key)) || /CHUNITHM NET|\{game\}\s*NET/.test(value));
    expect(leaks).toEqual([]);
  });

  it.each(locales)("keeps tomochu out of the maimai site in %s", async locale => {
    const leaks = strings(await loadMessages("maimai", locale) as Messages).filter(([, value]) => brandNames("chunithm").test(value));
    expect(leaks).toEqual([]);
  });

  it("gives every game the same per-game keys, each defined in exactly one layer", () => {
    const shared = new Set(keys(readMessages("en")));
    const [first, ...others] = CANONICAL_GAME_IDS.map(game => keys(readMessages(`games/${game}/en`)).sort());
    for (const other of others) expect(other).toEqual(first);
    expect(first.filter(key => shared.has(key))).toEqual([]);
  });

  it.each(locales.filter(locale => locale !== "en"))("defines exactly the shared English keys in %s", locale => {
    const english = new Set(keys(readMessages("en")));
    const translated = new Set(keys(readMessages(locale)));
    expect([...translated].filter(key => !english.has(key))).toEqual([]);
    // ko is a partial machine translation that falls back to English.
    if (locale !== "ko") expect([...english].filter(key => !translated.has(key))).toEqual([]);
  });

  it("translates only keys that the game's English copy defines", () => {
    for (const game of CANONICAL_GAME_IDS) {
      const english = new Set(keys(readMessages(`games/${game}/en`)));
      for (const locale of locales) {
        expect(keys(readMessages(`games/${game}/${locale}`)).filter(key => !english.has(key)), `${game} ${locale}`).toEqual([]);
      }
    }
  });
});
