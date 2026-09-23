import { getGameBrand } from "@/lib/games/frontend";
import { getFrontendGame } from "@/lib/games/frontend-server";
import { getGameRegion } from "@/lib/games/frontend";
import { resolvePublicUserByUsername } from "@/server/queries/public-access";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, localizePath } from "@/lib/seo";
import { safeDecodeURIComponent } from "@/lib/utils";

// This route looks up the user's main region from the DB and redirects to
// /profile/[username]/[region]. It can never serve static HTML (the redirect
// target is per-user and can change), so it is request-time by nature.
// Declaring it dynamic avoids the "changed from static to dynamic" bailout
// that ISR generation logged on every request.
export const dynamic = "force-dynamic";

interface ProfilePageProps {
  params: Promise<{
    locale: string;
    username: string;
  }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { locale: routeLocale, username: rawUsername } = await params;
  await setStaticLocale(routeLocale);
  const username = safeDecodeURIComponent(rawUsername);
  const [t, locale] = await Promise.all([
    getTranslations("profileMetadata"),
    getLocale(),
  ]);

  const game = getFrontendGame();
  const title = t("gameTitle", { username, brand: getGameBrand(game).title });
  const description = t("gameDescriptionUnknownRegion", { username, game: game.displayName, brand: game.productName });
  const path = `/profile/${encodeURIComponent(username)}`;

  // Mirror the regional page's metadata so embed crawlers that don't follow
  // the redirect still get a useful preview. The og:image is provided by the
  // regional page's opengraph-image.tsx — crawlers that follow the redirect
  // will pick that up; ones that don't get the title/description here.
  return {
    title,
    description,
    alternates: await buildAlternates(path),
    openGraph: {
      title,
      description,
      url: localizePath(path, locale),
      siteName: getGameBrand(getFrontendGame()).title,
      type: "profile",
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, username } = await params;
  await setStaticLocale(locale);

  try {
    // Get the user's profile to find their main region
    const game = getFrontendGame();
    if (!game.enabled) notFound();
    const profileData = await resolvePublicUserByUsername(safeDecodeURIComponent(username), game.id);
    const region = getGameRegion(game, profileData.profileMainRegion);
    if (!region) notFound();

    // Redirect to the specific region page using the user's main region
    redirect({ href: `/profile/${username}/${region}`, locale });
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound();
    }

    // Re-throw other errors
    throw error;
  }
}
