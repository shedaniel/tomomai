import { getFrontendGame } from "@/lib/games/frontend-server";
import type { Region } from "@/lib/types";
import { fetchPublicGameProfile } from "@/server/queries/game-profile";
import { GameProfile } from "@/components/game-profile";
import { createServerSideTRPC } from "@/lib/trpc-server";
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
  if (!game.enabled || !game.regions.includes(region as Region)) {
    return {
      title: tMeta("notFoundTitle"),
      description: tMeta("notFoundDescription"),
    };
  }

  if (game.id !== "maimai") {
    const path = `/profile/${encodeURIComponent(username)}/${region}`;
    return {
      title: `${username} | ${game.productName}`,
      alternates: await buildAlternates(path),
      openGraph: { title: `${username} | ${game.productName}`, siteName: game.productName, url: localizePath(path, locale), type: "profile", ...openGraphLocales(locale) },
    };
  }

  try {
    const trpc = await createServerSideTRPC();

    // Pull snapshot for description enrichment + 404 detection.
    const data = await trpc.user.getPublicSnapshotData({ game: game.id, username, region: region as Region });
    const snapshot = data.snapshot;

    const title = tMeta("title", { username });
    const description = tMeta("descriptionRich", {
      username,
      region: tRegions(region),
      rating: snapshot.rating,
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
        siteName: game.productName,
        type: "profile",
        images: [{ url: ogImageUrl(path, locale) }],
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
  if (!game.enabled || !game.regions.includes(region as Region)) notFound();

  if (game.id !== "maimai") {
    try {
      const decodedUsername = safeDecodeURIComponent(username);
      const { profile, snapshotData } = await fetchPublicGameProfile(game.id, decodedUsername, region as Region);
      return <GameProfile region={region as Region} username={decodedUsername} snapshotData={snapshotData} showAllScores={profile.profileShowAllScores} showScoreDetails={profile.profileShowScoreDetails} showPlayCounts={profile.profileShowPlayCounts} />;
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }

  try {
    const trpc = await createServerSideTRPC();

    // Get the user's profile data
    const profileData = await trpc.user.getPublicProfile({
      username: safeDecodeURIComponent(username),
    });

    // Get the user's snapshot data for the specified region
    const snapshotData = await trpc.user.getPublicSnapshotData({
      game: game.id,
      username: safeDecodeURIComponent(username),
      region: region as Region,
    });

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
      displayName: snapshotData.snapshot.displayName,
      username: decodedUsername,
      region: tNav(region),
      rating: snapshotData.snapshot.rating,
    });

    const profileJsonLd = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: tMeta("title", { username: decodedUsername }),
      description: pageDescription,
      mainEntity: {
        "@type": "Person",
        name: snapshotData.snapshot.displayName,
        alternateName: decodedUsername,
        identifier: decodedUsername,
        description: pageDescription,
        url: profileUrl,
        image: snapshotData.snapshot.iconUrl,
      },
      url: profileUrl,
    };

    const breadcrumb = breadcrumbJsonLd([
      { name: "tomomai", url: `${baseUrl}${localizePath("/", locale)}` },
      { name: tNav(region), url: profileUrl },
      { name: snapshotData.snapshot.displayName, url: profileUrl },
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
          region={region as Region}
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
