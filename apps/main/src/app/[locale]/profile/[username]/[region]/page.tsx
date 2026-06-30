import { createServerSideTRPC } from "@/lib/trpc-server";
import { TRPCError } from "@trpc/server";
import { Region } from "@/lib/types";
import { isRegionEnabledStr } from "@/lib/enabled-regions";
import { ProfilePage } from "@/components/profile-page";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { defaultFlags } from "@/lib/flags";
import { resolveBaseUrl } from "@/lib/base-url";
import { getTranslations } from "next-intl/server";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, breadcrumbJsonLd, ogImageUrl, localizePath } from "@/lib/seo";
import { safeDecodeURIComponent } from "@/lib/utils";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

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

  if (!isRegionEnabledStr(region)) {
    return {
      title: tMeta("notFoundTitle"),
      description: tMeta("notFoundDescription"),
    };
  }

  try {
    const trpc = await createServerSideTRPC();

    // Pull snapshot for description enrichment + 404 detection.
    const data = await trpc.user.getPublicSnapshotData({ username, region });
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
        siteName: "tomomai ともマイ",
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
  if (!isRegionEnabledStr(region)) {
    notFound();
  }

  try {
    const trpc = await createServerSideTRPC();

    // Get the user's profile data
    const profileData = await trpc.user.getPublicProfile({
      username: safeDecodeURIComponent(username),
    });

    // Get the user's snapshot data for the specified region
    const snapshotData = await trpc.user.getPublicSnapshotData({
      username: safeDecodeURIComponent(username),
      region,
    });

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
          region={region}
          username={decodedUsername}
          flags={flags}
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
