import { createProfileOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import { isRegionEnabledStr } from "@tomomai/catalog/enabled-regions";
import { db } from "@/lib/db";
import { userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import { resolvePublicUserByUsername } from "@/server/queries/public-access";
import { getReservedSnapshotData } from "@/server/queries/reserved";
import { TRPCError } from "@trpc/server";
import type { Locale } from "@/i18n/locale";
import type { VersionId } from "@tomomai/catalog/metadata";
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
  const username = decodeURIComponent(rawUsername);
  const t = await getTranslations({ locale, namespace: "regions" });

  if (!isRegionEnabledStr(region)) {
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
    const reservedData = await getReservedSnapshotData(username, region);
    if (reservedData) {
      const { snapshot } = reservedData;
      return createProfileOGImage({
        displayName: snapshot.displayName,
        title: snapshot.title,
        username,
        regionLabel: t(region),
        region,
        rating: snapshot.rating,
        gameVersion: snapshot.gameVersion as VersionId,
        iconUrl: snapshot.iconUrl,
        locale,
      });
    }

    const userData = await resolvePublicUserByUsername(username);
    const rows = await db
      .select({
        displayName: userSnapshots.displayName,
        title: userSnapshots.title,
        rating: userSnapshots.rating,
        gameVersion: userSnapshots.gameVersion,
        iconUrl: userSnapshots.iconUrl,
      })
      .from(userSnapshots)
      .where(and(eq(userSnapshots.userId, userData.id), eq(userSnapshots.region, region)))
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
      gameVersion: snapshot.gameVersion as VersionId,
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
