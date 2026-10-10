import type { CanonicalGameId } from "@/lib/games/ids";
import en from "../../../messages/en.json";
import enGB from "../../../messages/en-GB.json";
import ja from "../../../messages/ja.json";
import zhTW from "../../../messages/zh-TW.json";
import zhHK from "../../../messages/zh-HK.json";
import zhCN from "../../../messages/zh-CN.json";
import zhSG from "../../../messages/zh-SG.json";
import ko from "../../../messages/ko.json";
import maimaiEn from "../../../messages/games/maimai/en.json";
import maimaiEnGB from "../../../messages/games/maimai/en-GB.json";
import maimaiJa from "../../../messages/games/maimai/ja.json";
import maimaiZhTW from "../../../messages/games/maimai/zh-TW.json";
import maimaiZhHK from "../../../messages/games/maimai/zh-HK.json";
import maimaiZhCN from "../../../messages/games/maimai/zh-CN.json";
import maimaiZhSG from "../../../messages/games/maimai/zh-SG.json";
import maimaiKo from "../../../messages/games/maimai/ko.json";
import chunithmEn from "../../../messages/games/chunithm/en.json";
import chunithmEnGB from "../../../messages/games/chunithm/en-GB.json";
import chunithmJa from "../../../messages/games/chunithm/ja.json";
import chunithmZhTW from "../../../messages/games/chunithm/zh-TW.json";
import chunithmZhHK from "../../../messages/games/chunithm/zh-HK.json";
import chunithmZhCN from "../../../messages/games/chunithm/zh-CN.json";
import chunithmZhSG from "../../../messages/games/chunithm/zh-SG.json";
import chunithmKo from "../../../messages/games/chunithm/ko.json";

/** A locale's shared copy together with every game's own copy. */
function withGames(base: object, games: Record<CanonicalGameId, object>) {
  return { ...base, games };
}

const MESSAGES = {
  "en": withGames(en, { maimai: maimaiEn, chunithm: chunithmEn }),
  "en-GB": withGames(enGB, { maimai: maimaiEnGB, chunithm: chunithmEnGB }),
  "ja": withGames(ja, { maimai: maimaiJa, chunithm: chunithmJa }),
  "zh-TW": withGames(zhTW, { maimai: maimaiZhTW, chunithm: chunithmZhTW }),
  "zh-HK": withGames(zhHK, { maimai: maimaiZhHK, chunithm: chunithmZhHK }),
  "zh-CN": withGames(zhCN, { maimai: maimaiZhCN, chunithm: chunithmZhCN }),
  "zh-SG": withGames(zhSG, { maimai: maimaiZhSG, chunithm: chunithmZhSG }),
  "ko": withGames(ko, { maimai: maimaiKo, chunithm: chunithmKo }),
};

function flatten(obj: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (typeof obj === "string") {
    if (obj.length > 0) out.add(prefix);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

const EN_KEYS = flatten(MESSAGES.en);
const TOTAL = EN_KEYS.size;

function statsFor(locale: unknown) {
  const keys = flatten(locale);
  let translated = 0;
  for (const k of EN_KEYS) if (keys.has(k)) translated++;
  return {
    translated,
    missing: TOTAL - translated,
    total: TOTAL,
    percent: Math.floor((translated / TOTAL) * 100),
  };
}

export interface TranslationStat {
  locale: string;
  translated: number;
  missing: number;
  total: number;
  percent: number;
}

export const TRANSLATION_STATS: Record<string, TranslationStat> = Object.fromEntries(
  Object.entries(MESSAGES).map(([locale, messages]) => [locale, { locale, ...statsFor(messages) }]),
);
