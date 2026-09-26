// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { GameProvider } from "@/components/providers/game-provider";
import { useSnapshots } from "./useSnapshots";
import type { FrontendGame } from "@/lib/games/frontend";
import type { GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import type { Region } from "@/lib/types";

const transport = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), remove: vi.fn(), copy: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getSnapshots: { useQuery: (input: unknown, options: object) => useQuery({ queryKey: ["snapshots", input], queryFn: () => transport.list(input), ...options }) },
  getSnapshotData: { useQuery: (input: unknown, options: object) => useQuery({ queryKey: ["detail", input], queryFn: () => transport.detail(input), ...options }) },
  deleteSnapshot: { useMutation: (options: object) => useMutation({ mutationFn: transport.remove, ...options }) },
  copySnapshotToVersion: { useMutation: (options: object) => useMutation({ mutationFn: transport.copy, ...options }) },
} } }));

function fixture(game: "maimai" | "chunithm", id: string) {
  const summary: GameSnapshotSummary = { id, fetchedAt: new Date("2026-09-01"), gameVersion: 10, rating: 0, displayName: id, courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 0, totalPlayCount: 0 };
  const data: GameSnapshotData = { snapshot: { ...summary, publicId: id, game }, songs: [] };
  return { summary, data };
}
let result: ReturnType<typeof useSnapshots>;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const initial = fixture("maimai", "latest");
function Probe({ region = "jp" }: { region?: Region }) {
  result = useSnapshots(region, true, { initialSnapshots: [initial.summary], initialSnapshotData: initial.data });
  return <span>{result.selectedSnapshotData?.snapshot.displayName}</span>;
}
async function render(game: "maimai" | "chunithm" = "maimai", region: Region = "jp") {
  const descriptor: FrontendGame = { id: game, displayName: game, productName: game === "maimai" ? "tomomai" : "tomochu", enabled: true, regions: ["jp", "intl"], capabilities: ["scores"] };
  await act(async () => { root.render(<QueryClientProvider client={client}><GameProvider game={descriptor}><Probe region={region} /></GameProvider></QueryClientProvider>); });
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  transport.list.mockImplementation(({ game }: { game: "maimai" | "chunithm" }) => [fixture(game, `${game}-fresh`).summary]);
  transport.detail.mockImplementation(({ game, snapshotId }: { game: "maimai" | "chunithm"; snapshotId: string }) => fixture(game, snapshotId).data);
  transport.remove.mockResolvedValue({ success: true });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); });

describe("snapshot query lifecycle", () => {
  it("seeds the cold cache from SSR without fetching the same detail again", async () => {
    await render(); await settle();
    expect(container.textContent).toBe("latest");
    expect(transport.list).not.toHaveBeenCalled();
    expect(transport.detail).not.toHaveBeenCalled();
    expect(client.getQueryData(["detail", { game: "maimai", region: "jp", snapshotId: "latest" }])).toEqual(initial.data);
  });
  it("fetches a historical snapshot and resets to the latest on refresh", async () => {
    client.setQueryData(["snapshots", { game: "maimai", region: "jp" }], [initial.summary, fixture("maimai", "historical").summary]);
    await render();
    await act(async () => result.setSelectedSnapshot("historical")); await settle();
    expect(container.textContent).toBe("historical");
    await act(async () => result.refreshSnapshots()); await settle(); await settle();
    expect(container.textContent).toBe("maimai-fresh");
    expect(result.selectedSnapshot).toBe("maimai-fresh");
  });
  it("refreshes selection after deleting the displayed snapshot", async () => {
    await render();
    await act(async () => { await result.deleteSnapshot("latest"); }); await settle(); await settle();
    expect(transport.remove.mock.calls[0][0]).toEqual({ game: "maimai", region: "jp", snapshotId: "latest" });
    expect(container.textContent).toBe("maimai-fresh");
  });
  it.each([["chunithm", "jp"], ["maimai", "intl"]] as const)("does not seed another scope (%s/%s) with the first scope's SSR data", async (game, region) => {
    await render();
    await render(game, region); await settle(); await settle();
    expect(transport.list).toHaveBeenCalledWith({ game, region });
    expect(transport.detail).toHaveBeenCalledWith({ game, region, snapshotId: `${game}-fresh` });
    expect(result.selectedSnapshotData?.snapshot.game).toBe(game);
    expect(container.textContent).toBe(`${game}-fresh`);
  });
});
