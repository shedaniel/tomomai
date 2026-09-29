"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useGame } from "@/components/providers/game-provider";
import { getSnapshotSelection, type GameSnapshotData, type GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region } from "@/lib/types";

interface UseSnapshotsOptions {
  initialSnapshots?: GameSnapshotSummary[];
  initialSnapshotData?: GameSnapshotData;
}

export function useSnapshots(region: Region, isAuthenticated: boolean, options?: UseSnapshotsOptions) {
  const { initialSnapshots = [], initialSnapshotData } = options ?? {};
  const game = useGame();
  const scope = `${game.id}:${region}`;
  const [selection, setSelection] = useState<{ scope: string; id: string | null }>({ scope, id: initialSnapshots[0]?.publicId ?? null });
  const [initialScope] = useState(scope);
  const sameInitialScope = initialScope === scope;
  const enabled = isAuthenticated && game.regions.includes(region) && game.capabilities.includes("scores");
  const snapshotsQuery = trpc.user.getSnapshots.useQuery({ game: game.id, region }, {
    enabled,
    initialData: sameInitialScope ? initialSnapshots : undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const snapshots = snapshotsQuery.data ?? [];
  const selectedSnapshot = getSnapshotSelection(snapshots, selection.scope === scope ? selection.id : null);
  const initialData = sameInitialScope && initialSnapshotData?.snapshot.game === game.id && initialSnapshotData.snapshot.publicId === selectedSnapshot ? initialSnapshotData : null;
  const snapshotQuery = trpc.user.getSnapshotData.useQuery({ game: game.id, region, snapshotId: selectedSnapshot ?? "" }, {
    enabled: enabled && selectedSnapshot !== null,
    initialData: initialData ?? undefined,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const refresh = () => {
    setSelection({ scope, id: null });
    void snapshotsQuery.refetch();
    if (selectedSnapshot) void snapshotQuery.refetch();
  };
  const deleteMutation = trpc.user.deleteSnapshot.useMutation({ onSuccess: refresh });
  const copyMutation = trpc.user.copySnapshotToVersion.useMutation({ onSuccess: refresh });
  return {
    snapshots,
    selectedSnapshot,
    selectedSnapshotData: selectedSnapshot ? snapshotQuery.data ?? initialData : null,
    setSelectedSnapshot: (id: string | null) => setSelection({ scope, id }),
    deleteSnapshot: (snapshotId: string) => deleteMutation.mutateAsync({ game: game.id, snapshotId, region }),
    copySnapshot: (snapshotId: string, targetVersion: number) => copyMutation.mutateAsync({ game: game.id, snapshotId, region, targetVersion }),
    isCopying: copyMutation.isPending,
    isLoading: enabled && (snapshotsQuery.isLoading || (!!selectedSnapshot && !initialData && snapshotQuery.isLoading)),
    error: snapshotsQuery.error ?? snapshotQuery.error,
    refreshSnapshots: refresh,
  };
}
