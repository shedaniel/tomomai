// @ts-expect-error - No types available for kuroshiro
import Kuroshiro from "kuroshiro";
// @ts-expect-error - No types available for kuroshiro-analyzer-kuromoji
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

let kuroshiroInstance: Kuroshiro | null = null;
let initPromise: Promise<Kuroshiro> | null = null;

/**
 * Get or initialize the kuroshiro instance (singleton)
 */
async function getKuroshiro(): Promise<Kuroshiro> {
  if (kuroshiroInstance) {
    return kuroshiroInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const kuroshiro = new Kuroshiro();
    await kuroshiro.init(new KuromojiAnalyzer());
    kuroshiroInstance = kuroshiro;
    return kuroshiro;
  })();

  return initPromise;
}

/**
 * Convert Japanese text to romaji
 * Handles hiragana, katakana, and kanji
 */
export async function toRomaji(text: string): Promise<string> {
  const kuroshiro = await getKuroshiro();
  return kuroshiro.convert(text, { to: "romaji" });
}

export async function toKatakana(text: string): Promise<string> {
  const kuroshiro = await getKuroshiro();
  return kuroshiro.convert(text, { to: "katakana" });
}

export async function toHiragana(text: string): Promise<string> {
  const kuroshiro = await getKuroshiro();
  return kuroshiro.convert(text, { to: "hiragana" });
}

export async function toEverything(text: string): Promise<{
  romaji: string;
  katakana: string;
  hiragana: string;
}> {
  const kuroshiro = await getKuroshiro();
  const promises: Promise<{
    romaji?: string;
    katakana?: string;
    hiragana?: string;
  }[]> = await Promise.all([
    kuroshiro.convert(text, { to: "romaji" }).then((romaji: string) => ({ romaji })),
    kuroshiro.convert(text, { to: "katakana" }).then((katakana: string) => ({ katakana })),
    kuroshiro.convert(text, { to: "hiragana" }).then((hiragana: string) => ({ hiragana })),
  ]);
  const [romaji, katakana, hiragana] = await promises;
  return {
    romaji: romaji?.romaji ?? "",
    katakana: katakana?.katakana ?? "",
    hiragana: hiragana?.hiragana ?? "",
  }
}