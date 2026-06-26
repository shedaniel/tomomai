import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, localizePath } from "@/lib/seo";
import { safeDecodeURIComponent } from "@/lib/utils";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

interface ProfilePageProps {
  params: Promise<{
    locale: string;
    username: string;
  }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username: rawUsername } = await params;
  const username = safeDecodeURIComponent(rawUsername);
  const [t, locale] = await Promise.all([
    getTranslations("profileMetadata"),
    getLocale(),
  ]);

  const path = `/profile/${encodeURIComponent(username)}`;

  // Mirror the regional page's metadata so embed crawlers that don't follow
  // the redirect still get a useful preview. The og:image is provided by the
  // regional page's opengraph-image.tsx — crawlers that follow the redirect
  // will pick that up; ones that don't get the title/description here.
  return {
    title: t("title", { username }),
    description: t("descriptionUnknownRegion", { username }),
    alternates: await buildAlternates(path),
    openGraph: {
      title: t("title", { username }),
      description: t("descriptionUnknownRegion", { username }),
      url: localizePath(path, locale),
      siteName: "tomomai ともマイ",
      type: "profile",
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title", { username }),
      description: t("descriptionUnknownRegion", { username }),
    },
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, username } = await params;

  try {
    // Get the user's profile to find their main region
    const trpc = await createServerSideTRPC();
    const profileData = await trpc.user.getPublicProfile({
      username: safeDecodeURIComponent(username),
    });

    // Redirect to the specific region page using the user's main region
    redirect({ href: `/profile/${username}/${profileData.profileMainRegion}`, locale });
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound();
    }

    // Re-throw other errors
    throw error;
  }
}
