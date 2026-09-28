import { DataContent } from "@/components/data-content";
import { PublicDataBanner } from "@/components/public-data-banner";
import { Header } from "@/components/header";
import { Flags } from "@/lib/flags";
import { ProfileData, Region } from "@/lib/types";
import { TomomaiAI } from "@/components/tomomai-ai";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { toMaimaiPlayerSnapshot } from "@/lib/games/maimai/legacy-view";
import type { FrontendGame } from "@/lib/games/frontend";
import { Suspense } from "react";

interface ProfilePageProps {
  profileData: ProfileData;
  snapshotData: GameSnapshotData | null;
  game: FrontendGame;
  region: Region;
  username: string;
  initialTab?: string;
  flags: Flags;
  isOwner: boolean;
}

export function ProfilePage({
  profileData,
  game,
  snapshotData,
  region,
  username,
  initialTab,
  flags,
  isOwner,
}: ProfilePageProps) {


  return (
    <div className="container mx-auto max-w-[1300px] px-3 md:px-6 lg:px-12 py-8">
      <Header
        currentTab="dashboard"
        customThemesEnabled={flags.customThemes}
      />

      <div className="space-y-6">
        <PublicDataBanner
          region={region}
          snapshotData={snapshotData ? {
            fetchedAt: snapshotData.snapshot.fetchedAt,
            displayName: snapshotData.snapshot.displayName,
            rating: snapshotData.snapshot.rating,
            gameVersion: snapshotData.snapshot.gameVersion,
          } : null}
          profileUsername={username}
        />

        <Suspense>
          <DataContent
            region={region}
            selectedSnapshotData={snapshotData}
            privacySettings={{
              profileShowAllScores: profileData.profileShowAllScores,
              profileShowScoreDetails: profileData.profileShowScoreDetails,
              profileShowPlates: profileData.profileShowPlates,
              profileShowPlayCounts: profileData.profileShowPlayCounts,
              profileShowEvents: profileData.profileShowEvents,
              profileShowInSearch: profileData.profileShowInSearch,
            }}
            isLoading={false}
            visitableProfileAt={username}
            profileDescription={profileData.profileDescription}
            profileUsername={username}
            profileUserId={profileData.id}
            publishProfile={profileData.publishProfile}
            isOwner={isOwner}
            initialTab={initialTab}
            visitedBySelf={false}
            flags={flags}
          />
        </Suspense>
      </div>
      {game.id === "maimai" && snapshotData && <TomomaiAI snapshotData={toMaimaiPlayerSnapshot(snapshotData)} region={region} aprilFools2026={flags.aprilFools2026} />}
    </div>
  );
}
