import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@/components/providers/game-provider";
import { useSnapshots } from "./useSnapshots";
import type { FrontendGame } from "@/lib/games/frontend";
import type { GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";

const calls = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getSnapshotsForGame: { useQuery: (input: unknown, options: {initialData?: unknown}) => { calls.list(input); return { data: options.initialData, refetch: vi.fn(), isLoading: false }; } },
  getSnapshotForGame: { useQuery: (input: unknown) => { calls.detail(input); return { data: undefined, refetch: vi.fn(), isLoading: false }; } },
  deleteSnapshot: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  copySnapshotToVersion: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
} } }));

function Probe({ data, summary }: { data: GameSnapshotData; summary: GameSnapshotSummary }) {
  const result = useSnapshots("jp", true, { initialSnapshotData: data, initialSnapshots: [summary] });
  return <span>{result.normalizedSnapshotData?.snapshot.game}:{result.selectedSnapshot}</span>;
}

describe("shared snapshot query path", () => {
  it.each(["maimai", "chunithm"] as const)("loads %s with the same game-scoped procedures", game => {
    const descriptor: FrontendGame = { id: game, displayName: game, productName: game === "maimai" ? "tomomai" : "tomochu", enabled: true, regions: ["jp"], capabilities: ["scores"] };
    const summary: GameSnapshotSummary = { id: `${game}-snapshot`, fetchedAt: new Date("2026-09-01"), gameVersion: 10, rating: 0, displayName: "Player", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 0, totalPlayCount: 0 };
    const data: GameSnapshotData = { snapshot: { ...summary, publicId: summary.id, game }, songs: [] };
    const markup = renderToStaticMarkup(<GameProvider game={descriptor}><Probe data={data} summary={summary} /></GameProvider>);
    expect(calls.list).toHaveBeenLastCalledWith({ game, region: "jp" });
    expect(calls.detail).toHaveBeenLastCalledWith({ game, region: "jp", snapshotId: summary.id });
    expect(markup).toContain(game);
    expect(markup).toContain(summary.id);
  });
});
