import { DataContent } from "@/components/data-content";
import { PublicDataBanner } from "@/components/public-data-banner";
import { Header } from "@/components/header";
import { defaultFlags } from "@/lib/flags";
import { Difficulty, ProfileData, Region, SnapshotWithSongs, SongWithScore } from "@/lib/types";

interface SnapshotData {
  snapshot: {
    id: string;
    fetchedAt: Date;
    rating: number;
    displayName: string;
    gameVersion: number;
    courseRankUrl: string;
    classRankUrl: string;
    stars: number;
    versionPlayCount: number;
    totalPlayCount: number;
    iconUrl: string;
    title: string;
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
    addedVersion: number;
    achievement: number;
    dxScore: number;
    fc: string;
    fs: string;
  }>;
  privacySettings: {
    showPlayCounts: boolean;
    showPlates: boolean;
    showEvents: boolean;
  };
}

interface ProfilePageProps {
  profileData: ProfileData;
  snapshotData: SnapshotData;
  region: Region;
  username: string;
  initialTab?: string;
}

export function ProfilePage({
  profileData,
  snapshotData,
  region,
  username,
  initialTab,
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
  };

  return (
    <div className="container mx-auto max-w-[1300px] px-4 py-8">
      <Header
        currentTab="dashboard"
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
          flags={defaultFlags}
        />
      </div>
    </div>
  );
}
