import { brandTitle, getGameRegion, isPlayerAvailable } from "@/lib/games/frontend";
import { getCurrentGame } from "@/lib/games/current";
import { resolvePublicUserByUsername } from "@/server/queries/public-access";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { buildPageMetadata } from "@/lib/seo";
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

  const { brand } = getCurrentGame();
  // Crawlers that do not follow the redirect still get the profile's title and description. The image belongs
  // to the regional page, whose region this route only learns from the database.
  return buildPageMetadata({
    brand,
    locale,
    path: `/profile/${encodeURIComponent(username)}`,
    title: t("title", { username, brand: brandTitle(brand) }),
    description: t("description", { username, game: brand.displayName, brandName: brand.productName }),
    ogType: "profile",
    image: "none",
  });
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, username } = await params;
  await setStaticLocale(locale);

  try {
    // Get the user's profile to find their main region
    const game = getCurrentGame();
    if (!isPlayerAvailable(game)) notFound();
    const profileData = await resolvePublicUserByUsername(safeDecodeURIComponent(username), game.id);
    const region = getGameRegion(game, profileData.profileMainRegion);

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
