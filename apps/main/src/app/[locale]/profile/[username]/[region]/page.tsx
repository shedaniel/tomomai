import { brandTitle, isGameRegion, type FrontendGame } from "@/lib/games/frontend";
import { formatGameRating } from "@/lib/games/presentation";
import { getCurrentGame } from "@/lib/games/current";
import type { GameSnapshot } from "@/lib/games/player-view";
import type { Region } from "@/lib/games/ids";
import { fetchPublicGameProfile } from "@/server/queries/game-profile";
import { TRPCError } from "@trpc/server";
import { ProfilePage } from "@/components/player/profile-page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { defaultFlags } from "@/lib/flags";
import { resolveBaseUrl } from "@/lib/base-url";
import { getTranslations } from "next-intl/server";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { breadcrumbJsonLd, buildPageMetadata, localizePath } from "@/lib/seo";
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

type ProfileCopy = {
  game: FrontendGame;
  username: string;
  region: Region;
  snapshot: GameSnapshot | undefined;
};

/** The profile's title and description, shared by its metadata and its structured data. */
async function describeProfile({ game, username, region, snapshot }: ProfileCopy): Promise<{ title: string; description: string }> {
  const [tMeta, tRegions] = await Promise.all([getTranslations("profileMetadata"), getTranslations("regions")]);
  const brandName = game.brand.productName;
  return {
    title: tMeta("title", { username, brand: brandTitle(game.brand) }),
    description: snapshot
      ? tMeta("descriptionRich", {
        game: game.brand.displayName,
        brandName,
        username,
        region: tRegions(region),
        displayName: snapshot.displayName,
        rating: formatGameRating(game.id, snapshot.rating),
      })
      : tMeta("description", { username, game: game.brand.displayName, brandName }),
  };
}

export async function generateMetadata({ params }: RegionProfilePageProps): Promise<Metadata> {
  const { locale: routeLocale, username: rawUsername, region } = await params;
  await setStaticLocale(routeLocale);
  const username = safeDecodeURIComponent(rawUsername);

  const [tMeta, locale] = await Promise.all([
    getTranslations("profileMetadata"),
    getLocale(),
  ]);

  const game = getCurrentGame();
  const brand = brandTitle(game.brand);
  if (!isGameRegion(game, region)) {
    return {
      title: tMeta("notFoundTitle", { brand }),
      description: tMeta("notFoundDescription"),
    };
  }

  try {
    const { snapshotData } = await fetchPublicGameProfile(game.id, username, region);
    return buildPageMetadata({
      brand: game.brand,
      locale,
      path: `/profile/${encodeURIComponent(username)}/${region}`,
      ...await describeProfile({ game, username, region, snapshot: snapshotData?.snapshot }),
      ogType: "profile",
      image: "route",
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      return {
        title: tMeta("notFoundTitle", { brand }),
        description: tMeta("notFoundDescription"),
      };
    }

    return {
      title: tMeta("errorTitle", { brand }),
      description: tMeta("errorDescription"),
    };
  }
}


export default async function RegionProfilePage({ params }: RegionProfilePageProps) {
  const { locale: routeLocale, username, region } = await params;
  await setStaticLocale(routeLocale);

  // Validate region
  const game = getCurrentGame();
  if (!isGameRegion(game, region)) notFound();

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
    const [tNav, profileCopy] = await Promise.all([
      getTranslations("regions"),
      describeProfile({ game, username: decodedUsername, region, snapshot: snapshotData?.snapshot }),
    ]);
    const pageDescription = profileCopy.description;

    const profileJsonLd = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: profileCopy.title,
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
      { name: game.brand.productName, url: `${baseUrl}${localizePath("/", locale)}` },
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
