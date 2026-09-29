import { getCurrentGame } from "@/lib/games/current";
import { isGameRegion } from "@/lib/games/frontend";
import { notFound } from "next/navigation";
import { createProfileOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import { resolvePublicUserByUsername } from "@/server/queries/public-access";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { TRPCError } from "@trpc/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string; region: string }>;
};

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: "maimai profile", size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const [{ username: rawUsername, region }, locale] = await Promise.all([params, id]) as [{ username: string; region: string }, Locale];
  const game = getCurrentGame();
  // TODO: Add CHUNITHM profile image rendering from normalized player data.
  if (game.id !== "maimai") notFound();
  const username = decodeURIComponent(rawUsername);
  const t = await getTranslations({ locale, namespace: "regions" });

  if (!isGameRegion(game, region)) {
    return createProfileOGImage({
      displayName: username,
      username,
      regionLabel: region,
      region: "intl",
      rating: 0,
      locale,
    });
  }

  try {
    const reservedData = await GAME_SERVER_MODULES[game.id].reserved?.snapshot(username, region);
    if (reservedData) {
      const { snapshot } = reservedData;
      return createProfileOGImage({
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
    }

    const userData = await resolvePublicUserByUsername(username, game.id);
    const rows = await db
      .select({
        displayName: userSnapshots.displayName,
        title: userSnapshots.title,
        rating: userSnapshots.rating,
        gameVersion: userSnapshots.gameVersion,
        iconUrl: userSnapshots.iconUrl,
      })
      .from(userSnapshots)
      .where(and(eq(userSnapshots.game, game.id), eq(userSnapshots.userId, userData.id), eq(userSnapshots.region, region)))
      .orderBy(desc(userSnapshots.fetchedAt))
      .limit(1);

    if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No snapshot" });
    const snapshot = rows[0];

    return createProfileOGImage({
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
    if (!(error instanceof TRPCError)) throw error;
    return createProfileOGImage({
      displayName: username,
      username,
      regionLabel: t(region),
      region,
      rating: 0,
      locale,
    });
  }
}
