"use client";

import { useState } from "react";
import { useGame } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { getSnapshotSelection, type GameSnapshotData, type GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region } from "@/lib/types";

export function useGameSnapshots(region: Region, initialSnapshots: GameSnapshotSummary[], initialSnapshotData?: GameSnapshotData | null, isAuthenticated = true) {
  const game = useGame();
  const scope = `${game.id}:${region}`;
  const [selection, setSelection] = useState<{ scope: string; id: string | null }>({ scope, id: initialSnapshots[0]?.id ?? null });
  const [initialScope] = useState(scope);
  const sameInitialScope = initialScope === scope;
  const enabled = isAuthenticated && game.enabled && game.regions.includes(region) && game.capabilities.includes("scores");
  const snapshotsQuery = trpc.user.getSnapshots.useQuery({ game: game.id, region }, {
    enabled,
    initialData: sameInitialScope ? initialSnapshots : undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const snapshots = snapshotsQuery.data ?? [];
  const selectedSnapshot = getSnapshotSelection(snapshots, selection.scope === scope ? selection.id : null);
  const snapshotQuery = trpc.user.getSnapshotData.useQuery({ game: game.id, region, snapshotId: selectedSnapshot ?? "" }, {
    enabled: enabled && selectedSnapshot !== null,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const initialData = sameInitialScope && initialSnapshotData?.snapshot.game === game.id && initialSnapshotData.snapshot.publicId === selectedSnapshot ? initialSnapshotData : null;
  return {
    snapshots,
    selectedSnapshot,
    setSelectedSnapshot: (id: string) => setSelection({ scope, id }),
    data: selectedSnapshot ? snapshotQuery.data ?? initialData : null,
    isLoading: enabled && (snapshotsQuery.isLoading || (!!selectedSnapshot && !initialData && snapshotQuery.isLoading)),
    error: snapshotsQuery.error ?? snapshotQuery.error,
    refresh: () => {
      setSelection({ scope, id: null });
      void snapshotsQuery.refetch();
      if (selectedSnapshot) void snapshotQuery.refetch();
    },
  };
}
