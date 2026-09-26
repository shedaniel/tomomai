import { getGameBrand, isGameRegion } from "@/lib/games/frontend";
import { getFrontendGame } from "@/lib/games/frontend-server";
import { fetchPublicGameProfile } from "@/server/queries/game-profile";
import { TRPCError } from "@trpc/server";
import { ProfilePage } from "@/components/profile-page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { defaultFlags } from "@/lib/flags";
import { resolveBaseUrl } from "@/lib/base-url";
import { getTranslations } from "next-intl/server";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, breadcrumbJsonLd, ogImageUrl, localizePath } from "@/lib/seo";
import { safeDecodeURIComponent } from "@/lib/utils";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

interface RegionProfilePageProps {
  params: Promise<{
    locale: string;
    username: string;
    region: string;
  }>;
}

export async function generateMetadata({ params }: RegionProfilePageProps): Promise<Metadata> {
  const { locale: routeLocale, username: rawUsername, region } = await params;
  await setStaticLocale(routeLocale);
  const username = safeDecodeURIComponent(rawUsername);

  const [tMeta, tRegions, locale] = await Promise.all([
    getTranslations("profileMetadata"),
    getTranslations("regions"),
    getLocale(),
  ]);

  const game = getFrontendGame();
  if (!game.enabled || !isGameRegion(game, region)) {
    return {
      title: tMeta("notFoundTitle"),
      description: tMeta("notFoundDescription"),
    };
  }

  try {
    const { snapshotData } = await fetchPublicGameProfile(game.id, username, region);
    const snapshot = snapshotData?.snapshot;
    if (!snapshot) return { title: tMeta("title", { username, brand: getGameBrand(game).title }), alternates: await buildAlternates(`/profile/${encodeURIComponent(username)}/${region}`) };

    const title = tMeta("title", { username, brand: getGameBrand(game).title });
    const description = tMeta("descriptionRich", {
      game: game.displayName,
      brand: game.productName,
      username,
      region: tRegions(region),
      displayName: snapshot.displayName,
    });

    const path = `/profile/${encodeURIComponent(username)}/${region}`;

    return {
      title,
      description,
      alternates: await buildAlternates(path),
      openGraph: {
        title,
        description,
        url: localizePath(path, locale),
        siteName: getGameBrand(game).title,
        type: "profile",
        ...(game.id === "maimai" ? { images: [{ url: ogImageUrl(path, locale) }] } : {}),
        ...openGraphLocales(locale),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      return {
        title: tMeta("notFoundTitle"),
        description: tMeta("notFoundDescription"),
      };
    }

    return {
      title: tMeta("errorTitle"),
      description: tMeta("errorDescription"),
    };
  }
}


export default async function RegionProfilePage({ params }: RegionProfilePageProps) {
  const { locale: routeLocale, username, region } = await params;
  await setStaticLocale(routeLocale);

  // Validate region
  const game = getFrontendGame();
  if (!game.enabled || !isGameRegion(game, region)) notFound();

  try {
    const { profile: profileData, snapshotData } = await fetchPublicGameProfile(game.id, safeDecodeURIComponent(username), region);

    const session = await getServerSession();
    const isOwner = session?.user.id === profileData.id;

    const flags = defaultFlags;

    const decodedUsername = safeDecodeURIComponent(username);
    const baseUrl = resolveBaseUrl();
    const locale = await getLocale();
    const profilePath = localizePath(`/profile/${encodeURIComponent(decodedUsername)}/${region}`, locale);
    const profileUrl = `${baseUrl}${profilePath}`;
    const [tNav, tMeta] = await Promise.all([
      getTranslations("regions"),
      getTranslations("profileMetadata"),
    ]);

    const pageDescription = tMeta("descriptionRich", {
      game: game.displayName,
      brand: game.productName,
      displayName: snapshotData?.snapshot.displayName ?? decodedUsername,
      username: decodedUsername,
      region: tNav(region),
    });

    const profileJsonLd = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: tMeta("title", { username: decodedUsername, brand: getGameBrand(game).title }),
      description: pageDescription,
      mainEntity: {
        "@type": "Person",
        name: snapshotData?.snapshot.displayName ?? decodedUsername,
        alternateName: decodedUsername,
        identifier: decodedUsername,
        description: pageDescription,
        url: profileUrl,
        image: snapshotData?.snapshot.iconUrl,
      },
      url: profileUrl,
    };

    const breadcrumb = breadcrumbJsonLd([
      { name: game.productName, url: `${baseUrl}${localizePath("/", locale)}` },
      { name: tNav(region), url: profileUrl },
      { name: snapshotData?.snapshot.displayName ?? decodedUsername, url: profileUrl },
    ]);

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
        <ProfilePage
          game={game}
          profileData={profileData}
          snapshotData={snapshotData}
          region={region}
          username={decodedUsername}
          flags={flags}
          isOwner={isOwner}
        />
      </>
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound();
    }

    // Re-throw other errors
    throw error;
  }
}
