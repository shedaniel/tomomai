import { describe, expect, it } from "vitest";
import { matchLocale } from "@tomomai/userscript/i18n";
import { routing } from "@/i18n/routing";

describe("userscript panel language", () => {
  it.each([
    ["en", "en"],
    ["en-GB", "en"],
    ["ja", "ja"],
    ["ko", "ko"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-Hant-TW", "zh-Hant"],
    ["fr-FR", null],
    ["", null],
  ])("maps %s to %s", (tag, locale) => {
    expect(matchLocale(tag)).toBe(locale);
  });

  it("has a language for every site locale", () => {
    for (const locale of routing.locales) expect(matchLocale(locale)).not.toBeNull();
  });
});
