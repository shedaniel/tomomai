import { createProfileOGImage, OG_SIZE } from "@/lib/og";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { getLocale } from "@/i18n/locale-server";
import { getTranslations } from "next-intl/server";
import { TRPCError } from "@trpc/server";
import type { Region } from "@/lib/types";

export const runtime = "nodejs";
export const alt = "maimai profile";
export const size = OG_SIZE;
export const contentType = "image/png";

type Props = {
  params: Promise<{ username: string; region: string }>;
};

function isValidRegion(region: string): region is Region {
  return region === "intl" || region === "jp";
}

export default async function Image({ params }: Props) {
  const { username: rawUsername, region } = await params;
  const username = decodeURIComponent(rawUsername);
  const locale = await getLocale();
  const t = await getTranslations("regions");

  if (!isValidRegion(region)) {
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
    const trpc = await createServerSideTRPC();
    const data = await trpc.user.getPublicSnapshotData({ username, region });
    const snapshot = data.snapshot;

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
