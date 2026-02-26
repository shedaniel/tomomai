import { AuthHandler } from "@/components/auth-handler";
import { Dashboard } from "@/components/dashboard";
import { LoginScreen } from "@/components/login-screen";
import { getServerSession } from "@/lib/auth-server";
import { applyFlagOverrides, useFlags } from "@/lib/flags";
import { getLatestPost } from "@/lib/posts";
import { getLocale } from "@/i18n/locale-server";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Force dynamic rendering since we need to check authentication
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function Home() {
  const session = await getServerSession();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  let flags = await useFlags();

  // Apply flag overrides from cookies
  const cookieStore = await cookies();
  const flagOverridesCookie = cookieStore.get("flagOverrides")?.value;
  flags = applyFlagOverrides(flags, flagOverridesCookie);

  if (!session) {
    // Fetch signup requirements on the server
    const trpc = await createServerSideTRPC();
    const signupRequirements = await trpc.user.getSignupRequirements() as {
      signupEnabled: boolean;
      inviteRequired: boolean;
      reason: 'disabled' | 'invite-only' | 'enabled' | 'open';
    };

    return (
      <>
        <Suspense fallback={null}>
          <AuthHandler />
        </Suspense>
        <LoginScreen signupRequirements={signupRequirements} />
      </>
    );
  }

  // Fetch initial dashboard data on the server with authenticated context
  const trpc = await createServerSideTRPC(session);

  // First, get user data to determine their region preference
  const userData = await trpc.user.getUserData().catch(() => ({
    hasUsername: false,
    username: null,
    publishProfile: false,
    region: "intl" as const,
    role: "user" as const,
  }));

  const userRegion = userData.region || "intl";

  // Then fetch all other data in parallel using the correct region
  const [snapshotsData] = await Promise.all([
    trpc.user.getSnapshots({ region: userRegion }).catch(() => ({ snapshots: [] })),
  ]);

  // Fetch the latest snapshot data if we have snapshots
  // This is the slowest query (potentially hundreds of songs), so we do it last
  const latestSnapshotId = snapshotsData.snapshots[0]?.id;
  const initialSnapshotData = latestSnapshotId
    ? await trpc.user.getSnapshotData({
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
