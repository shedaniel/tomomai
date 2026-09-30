import { getCurrentGame } from "@/lib/games/current";
import { createDbOGImage, OG_SIZE } from "@/lib/og";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";
import { getDatabaseCopy } from "./catalog-copy";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: `${brand.productName} database`, size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ id }: { id: Promise<string> }) {
  const game = getCurrentGame();
  const locale = (await id) as Locale;
  const { description } = await getDatabaseCopy(locale, game);
  return createDbOGImage({ brand: game.brand, tagline: description, locale });
}
