import { beforeEach, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { computeStatsForSnapshot } from "./stats";

const score = (scoreValue: number, addedVersion: number, difficulty: number, comboStatus: number, syncStatus: number, clearStatus: number) =>
  ({ scoreValue, addedVersion, difficulty, comboStatus, syncStatus, clearStatus });
const charts = (addedVersion: number, difficulty: number, count: number) => ({ addedVersion, difficulty, count });

// Snapshot 41's scores answer only a read of that snapshot, and the chart counts only a read of the game's jp catalog of the version.
function store(game: CanonicalGameId, gameVersion: number, scores: ProxyRow[], catalog: ProxyRow[]) {
  proxy.answer(({ table, params }) => {
    if (table === "snapshot_scores") return params.includes(41) ? scores : [];
    if (table === "songs") return [game, "jp", gameVersion].every(value => params.includes(value)) ? catalog : [];
  });
}

beforeEach(() => proxy.reset());

it("counts CHUNITHM clear lamps beside its combo and chain statuses", async () => {
  store(
    "chunithm", 9,
    [score(1009500, 9, 3, 3, 1, 2), score(1007500, 9, 3, 0, 0, 1), score(950000, 8, 4, 0, 0, 0)],
    [charts(9, 3, 20)],
  );

  await expect(computeStatsForSnapshot("chunithm", 41, 9, "jp")).resolves.toStrictEqual({
    stats: {
      9: { 3: { grades: { "SSS+": 1, SSS: 1 }, statuses: { comboStatus: { 3: 1 }, syncStatus: { 1: 1 }, clearStatus: { 1: 1, 2: 1 } }, total: 2 } },
      8: { 4: { grades: { AAA: 1 }, statuses: { comboStatus: {}, syncStatus: {}, clearStatus: {} }, total: 1 } },
    },
    totalSongs: { 9: { 3: 20 } },
  });
});
