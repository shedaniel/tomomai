import { getFrontendGame } from "@/lib/games/frontend-server";
import { getGameRegion } from "@/lib/games/frontend";
import { GameDashboard } from "@/components/game-dashboard";
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { LandingPage } from "@/components/landing-page";
import { getServerSession } from "@/lib/auth-server";
import { useFlags } from "@/lib/flags";
import { getLatestPost } from "@/lib/posts";
import { getLocale } from "@/i18n/locale-server";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { getSignupRequirements } from "@/lib/signup";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildAlternates, openGraphLocales, localizePath } from "@/lib/seo";

// Force dynamic rendering since we need to check authentication
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("dashboard"),
    getLocale(),
  ]);
  return {
    title: t("title"),
    description: t("description"),
    alternates: await buildAlternates("/"),
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: localizePath("/", locale),
      siteName: getFrontendGame().productName,
      type: "website",
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function Home() {
  const game = getFrontendGame();
  const session = await getServerSession();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  let flags = await useFlags();

  if (!session) {
    const signup = await getSignupRequirements();
    return (
      <LandingPage signInOptions={{ signup, passkey: flags.passkey, twitterOauth: flags.twitterOauth }} />
    );
  }

  // Fetch initial dashboard data on the server with authenticated context
  const trpc = await createServerSideTRPC(session);

  // First, get user data to determine their region preference
  const userData = await trpc.user.getUserData().catch(() => ({
    hasUsername: false,
    username: null,
    email: "",
    publishProfile: false,
    region: "intl" as const,
    role: "user" as const,
  }));

  const userRegion = getGameRegion(game, userData.region);
  if (!game.enabled || !userRegion) notFound();

  if (game.id !== "maimai") {
    const snapshots = await trpc.user.getSnapshotsForGame({ game: game.id, region: userRegion });
    const initialSnapshotData = snapshots[0]
      ? await trpc.user.getSnapshotForGame({ game: game.id, region: userRegion, snapshotId: snapshots[0].id })
      : null;
    return <GameDashboard user={session.user} region={userRegion} initialSnapshots={snapshots} initialSnapshotData={initialSnapshotData} />;
  }

  // Then fetch all other data in parallel using the correct region
  const [snapshotsData] = await Promise.all([
    trpc.user.getSnapshots({ game: game.id, region: userRegion }).catch(() => ({ snapshots: [] })),
  ]);

  // Fetch the latest snapshot data if we have snapshots
  // This is the slowest query (potentially hundreds of songs), so we do it last
  const latestSnapshotId = snapshotsData.snapshots[0]?.id;
  const initialSnapshotData = latestSnapshotId
    ? await trpc.user.getSnapshotData({
      game: game.id,
      snapshotId: latestSnapshotId,
      region: userRegion
    }).catch(() => undefined)
    : undefined;

  const locale = await getLocale();
  const latestPost = getLatestPost(locale);

  return (
    <Dashboard
      user={session.user}
      initialUserData={userData}
      initialSnapshots={snapshotsData.snapshots}
      initialSnapshotData={initialSnapshotData}
      flags={flags}
      latestPost={latestPost}
    />
  );
}
