import { getCatalogSection, getGameRegion, isPlayerAvailable } from "@/lib/games/frontend";
import { getCurrentGame } from "@/lib/games/current";
import type { GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import { Dashboard } from "@/components/player/dashboard";
import { GameUnavailable } from "@/components/player/game-unavailable";
import { LandingPage } from "@/components/landing-page";
import { getServerSession } from "@/lib/auth-server";
import { useFlags } from "@/lib/flags";
import { getLatestPost } from "@/lib/posts";
import { pageLogger } from "@/lib/request-logger";
import { getLocale } from "@/i18n/locale-server";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { getSignupRequirements } from "@/lib/signup";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";

// Force dynamic rendering since we need to check authentication
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("dashboard"),
    getLocale(),
  ]);
  const { brand } = getCurrentGame();
  return buildPageMetadata({
    brand,
    locale,
    path: "/",
    title: t("title"),
    description: t("description", { game: brand.displayName }),
    ogType: "website",
    image: "route",
  });
}

export default async function Home() {
  const game = getCurrentGame();
  if (!isPlayerAvailable(game)) return <GameUnavailable />;
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

  // A failed first load opens an empty dashboard, which still offers fetching, instead of an error page.
  let snapshots: GameSnapshotSummary[] = [];
  let initialSnapshotData: GameSnapshotData | undefined;
  try {
    snapshots = await trpc.user.getSnapshots({ game: game.id, region: userRegion });
    initialSnapshotData = snapshots[0]
      ? await trpc.user.getSnapshotData({ game: game.id, region: userRegion, snapshotId: snapshots[0].publicId }) ?? undefined
      : undefined;
  } catch (err) {
    (await pageLogger("home")).error({ err, game: game.id, region: userRegion }, "Dashboard initial snapshot load failed");
  }

  const locale = await getLocale();
  const latestPost = getCatalogSection(game, "posts") ? getLatestPost(locale) : null;

  return (
    <Dashboard
      user={session.user}
      initialUserData={userData}
      initialRegion={userRegion}
      initialSnapshots={snapshots}
      initialSnapshotData={initialSnapshotData}
      flags={flags}
      latestPost={latestPost}
    />
  );
}
