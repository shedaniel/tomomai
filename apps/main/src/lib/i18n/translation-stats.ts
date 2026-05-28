import en from "../../../messages/en.json";
import enGB from "../../../messages/en-GB.json";
import ja from "../../../messages/ja.json";
import zhTW from "../../../messages/zh-TW.json";
import zhHK from "../../../messages/zh-HK.json";
import zhCN from "../../../messages/zh-CN.json";
import zhSG from "../../../messages/zh-SG.json";
import ko from "../../../messages/ko.json";

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

const EN_KEYS = flatten(en);
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

export const TRANSLATION_STATS: Record<string, TranslationStat> = {
  "en": { locale: "en", ...statsFor(en) },
  "en-GB": { locale: "en-GB", ...statsFor(enGB) },
  "ja": { locale: "ja", ...statsFor(ja) },
  "zh-TW": { locale: "zh-TW", ...statsFor(zhTW) },
  "zh-HK": { locale: "zh-HK", ...statsFor(zhHK) },
  "zh-CN": { locale: "zh-CN", ...statsFor(zhCN) },
  "zh-SG": { locale: "zh-SG", ...statsFor(zhSG) },
  "ko": { locale: "ko", ...statsFor(ko) },
};
