import { getCurrentGame } from "@/lib/games/current";
import { createDbOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import type { Locale } from "@/i18n/locale";
import { getDatabaseCopy } from "./catalog-copy";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  return ogImageVariants(`${brand.productName} database`);
}

export default async function Image({ id }: { id: Promise<string> }) {
  const game = getCurrentGame();
  const locale = (await id) as Locale;
  const { description } = await getDatabaseCopy(locale, game);
  return createDbOGImage({ brand: game.brand, tagline: description, locale });
}
