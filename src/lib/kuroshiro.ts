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

