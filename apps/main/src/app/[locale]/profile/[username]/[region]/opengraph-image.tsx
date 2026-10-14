import { getCurrentGame } from "@/lib/games/current";
import { isGameRegion } from "@/lib/games/frontend";
import { GameError } from "@/lib/games/errors";
import { createProfileOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import { fetchPublicGameProfileHeader } from "@/server/queries/game-profile";
import { safeDecodeURIComponent } from "@/lib/utils";
import { TRPCError } from "@trpc/server";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string; region: string }>;
};

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  return ogImageVariants(`${brand.displayName} profile`);
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const [{ username: rawUsername, region }, locale] = await Promise.all([params, id]) as [{ username: string; region: string }, Locale];
  const game = getCurrentGame();
  const username = safeDecodeURIComponent(rawUsername);
  const t = await getTranslations({ locale, namespace: "regions" });

  // A profile with nothing public to show still gets a card, so a shared link never previews as a broken image.
  const placeholder = { game, displayName: username, username, rating: 0, locale };
  if (!isGameRegion(game, region)) return createProfileOGImage({ ...placeholder, regionLabel: region, region: "intl" });

  try {
    const { snapshot } = await fetchPublicGameProfileHeader(game.id, username, region);
    if (!snapshot) return createProfileOGImage({ ...placeholder, regionLabel: t(region), region });
    return createProfileOGImage({
      game,
      displayName: snapshot.displayName,
      title: snapshot.title,
      username,
      regionLabel: t(region),
      region,
      rating: snapshot.rating,
      gameVersion: snapshot.gameVersion,
      iconUrl: snapshot.iconUrl,
      locale,
    });
  } catch (error) {
    if (!(error instanceof TRPCError || error instanceof GameError)) throw error;
    return createProfileOGImage({ ...placeholder, regionLabel: t(region), region });
  }
}
