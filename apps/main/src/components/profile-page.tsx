import { DataContent } from "@/components/data-content";
import { PublicDataBanner } from "@/components/public-data-banner";
import { Header } from "@/components/header";
import { Flags } from "@/lib/flags";
import { Difficulty, EventData, ProfileData, Region, SnapshotWithSongs, SongWithScore, TitleType } from "@/lib/types";
import { TomomaiAI } from "@/components/tomomai-ai";
import { VersionId } from "@tomomai/catalog/metadata";

interface SnapshotData {
  snapshot: {
    id: string;
    fetchedAt: Date;
    rating: number;
    displayName: string;
    gameVersion: VersionId;
    courseRankUrl: string;
    classRankUrl: string;
    stars: number;
    versionPlayCount: number;
    totalPlayCount: number;
    iconUrl: string;
    title: string;
    titleType: TitleType;
  };
  songs: Array<{
    songId: string;
    songName: string;
    artist: string;
    cover: string;
    difficulty: string;
    level: string;
    levelPrecise: number;
    type: string;
    genre: string;
    addedVersion: VersionId;
    achievement: number;
    dxScore: number;
    fc: string;
    fs: string;
  }>;
  privacySettings: {
    showPlayCounts: boolean;
    showPlates: boolean;
    showEvents: boolean;
    showAllScores: boolean;
    showScoreDetails: boolean;
  };
  events?: EventData[];
}

interface ProfilePageProps {
  profileData: ProfileData;
  snapshotData: SnapshotData;
  region: Region;
  username: string;
  initialTab?: string;
  flags: Flags;
}

export function ProfilePage({
  profileData,
  snapshotData,
  region,
  username,
  initialTab,
  flags,
}: ProfilePageProps) {

  // Convert the snapshot data to the format expected by DataContent
  const snapshotWithSongs: SnapshotWithSongs = {
    snapshot: snapshotData.snapshot,
    songs: snapshotData.songs.map(song => ({
      ...song,
      difficulty: song.difficulty as Difficulty,
      type: song.type as "std" | "dx",
      fc: song.fc as "none" | "fc" | "fc+" | "ap" | "ap+",
      fs: song.fs as "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+",
    })) as SongWithScore[],
    ...(snapshotData.events && { events: snapshotData.events }),
  };

  return (
    <div className="container mx-auto max-w-[1300px] px-3 md:px-6 lg:px-12 py-8">
      <Header
        currentTab="dashboard"
        customThemesEnabled={flags.customThemes}
      />

      <div className="space-y-6">
        <PublicDataBanner
          region={region}
          snapshotData={{
            fetchedAt: snapshotData.snapshot.fetchedAt,
            displayName: snapshotData.snapshot.displayName,
            rating: snapshotData.snapshot.rating,
            gameVersion: snapshotData.snapshot.gameVersion,
          }}
          profileUsername={username}
        />

        <DataContent
          region={region}
          selectedSnapshotData={snapshotWithSongs}
          isLoading={false}
          privacySettings={snapshotData.privacySettings}
          visitableProfileAt={username}
          initialTab={initialTab}
          visitedBySelf={false}
          flags={flags}
        />
      </div>
      <TomomaiAI snapshotData={snapshotWithSongs} region={region} aprilFools2026={flags.aprilFools2026} />
    </div>
  );
}
