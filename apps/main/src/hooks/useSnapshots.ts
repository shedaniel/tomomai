"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useGame } from "@/components/providers/game-provider";
import { supportsGameFeature } from "@/lib/games/frontend";
import { getSnapshotSelection, type GameSnapshotData, type GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region } from "@/lib/games/ids";

interface UseSnapshotsOptions {
  initialSnapshots?: GameSnapshotSummary[];
  initialSnapshotData?: GameSnapshotData;
}

export function useSnapshots(region: Region, options?: UseSnapshotsOptions) {
  const { initialSnapshots = [], initialSnapshotData } = options ?? {};
  const game = useGame();
  const [selection, setSelection] = useState<{ region: Region; id: string | null }>({ region, id: initialSnapshots[0]?.publicId ?? null });
  // A region change refetches the user before the page reloads, so the new region must not reuse the page's snapshots.
  const [initialRegion] = useState(region);
  const sameInitialRegion = initialRegion === region;
  const enabled = supportsGameFeature(game, "scores", region);
  const snapshotsQuery = trpc.user.getSnapshots.useQuery({ game: game.id, region }, {
    enabled,
    initialData: sameInitialRegion ? initialSnapshots : undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const snapshots = snapshotsQuery.data ?? [];
  const selectedSnapshot = getSnapshotSelection(snapshots, selection.region === region ? selection.id : null);
  const initialData = sameInitialRegion && initialSnapshotData?.snapshot.publicId === selectedSnapshot ? initialSnapshotData : null;
  const snapshotQuery = trpc.user.getSnapshotData.useQuery({ game: game.id, region, snapshotId: selectedSnapshot ?? "" }, {
    enabled: enabled && selectedSnapshot !== null,
    initialData: initialData ?? undefined,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const showLatest = () => setSelection({ region, id: null });
  const refresh = () => {
    showLatest();
    void snapshotsQuery.refetch();
  };
  const deleteMutation = trpc.user.deleteSnapshot.useMutation({ onSuccess: refresh });
  const copyMutation = trpc.maimai.copySnapshotToVersion.useMutation({ onSuccess: refresh });
  return {
    snapshots,
    selectedSnapshot,
    selectedSnapshotData: selectedSnapshot ? snapshotQuery.data ?? initialData : null,
    setSelectedSnapshot: (id: string | null) => setSelection({ region, id }),
    deleteSnapshot: (snapshotId: string) => {
      showLatest();
      return deleteMutation.mutateAsync({ game: game.id, snapshotId, region });
    },
    copySnapshot: (snapshotId: string, targetVersion: number) => copyMutation.mutateAsync({ snapshotId, region, targetVersion }),
    isCopying: copyMutation.isPending,
    isLoading: enabled && (snapshotsQuery.isLoading || (!!selectedSnapshot && !initialData && snapshotQuery.isLoading)),
    refreshSnapshots: refresh,
  };
}
