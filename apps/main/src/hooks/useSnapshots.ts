import { trpc } from "@/lib/trpc-client";
import { useGameId } from "@/components/providers/game-provider";
import { useGameSnapshots } from "@/hooks/useGameSnapshots";
import { getPlayerPresentation, toPlayerSnapshotSummary, type GameSnapshotData, type GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region } from "@/lib/types";

interface UseSnapshotsOptions {
  initialSnapshots?: GameSnapshotSummary[];
  initialSnapshotData?: GameSnapshotData;
}

export function useSnapshots(region: Region, isAuthenticated: boolean, options?: UseSnapshotsOptions) {
  const game = useGameId();
  const query = useGameSnapshots(region, options?.initialSnapshots ?? [], options?.initialSnapshotData, isAuthenticated);
  const deleteMutation = trpc.user.deleteSnapshot.useMutation({ onSuccess: query.refresh });
  const copyMutation = trpc.user.copySnapshotToVersion.useMutation({ onSuccess: query.refresh });
  return {
    snapshots: query.snapshots.map(toPlayerSnapshotSummary),
    selectedSnapshot: query.selectedSnapshot,
    selectedSnapshotData: query.data ? getPlayerPresentation(game).legacySnapshot(query.data) : null,
    normalizedSnapshotData: query.data,
    setSelectedSnapshot: (id: string | null) => { if (id) query.setSelectedSnapshot(id); },
    deleteSnapshot: (snapshotId: string) => deleteMutation.mutateAsync({ game, snapshotId, region }),
    copySnapshot: (snapshotId: string, targetVersion: number) => copyMutation.mutateAsync({ game, snapshotId, region, targetVersion }),
    isCopying: copyMutation.isPending,
    isLoading: query.isLoading,
    error: query.error,
    refreshSnapshots: query.refresh,
  };
}
