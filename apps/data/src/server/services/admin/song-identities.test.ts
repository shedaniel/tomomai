import { describe, expect, it } from "vitest";
import { retiredSongIds, songs } from "@/lib/db/schema";
import { restoreSongIds, retireSongs } from "./song-identities";

describe("retired song identities", () => {
  it("reuses the exact bigint ID when a deleted chart returns through upload or import", async () => {
    const original = { id: 9007199254740993n, parentId: 12n, region: "jp" as const, gameVersion: 14 };
    let active = [original];
    const retired: typeof active = [];
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: async () => table === songs ? active : retired }) }),
      insert: (table: unknown) => ({ values: (rows: typeof active) => ({ onConflictDoNothing: async () => {
        expect(table).toBe(retiredSongIds);
        for (const row of rows) if (!retired.some(saved => saved.id === row.id)) retired.push(row);
      } }) }),
      delete: () => ({ where: () => ({ returning: async () => { const deleted = active; active = []; return deleted; } }) }),
    } as unknown as Parameters<typeof retireSongs>[0];
    expect(await retireSongs(tx, [original.id])).toBe(1);
    expect(active).toEqual([]);
    const input = { ...original, id: undefined, addedVersion: 14, level: "14" as const, levelPrecise: 140 };
    const restored = await restoreSongIds(tx, [input]);
    expect(restored[0].id).toBe(original.id);
    active = [{ ...original, id: restored[0].id! }];
    await retireSongs(tx, [original.id]);
    expect((await restoreSongIds(tx, [input]))[0].id).toBe(original.id);
    expect(retired).toHaveLength(1);
    expect((await restoreSongIds(tx, [{ ...input, gameVersion: 15 }]))[0].id).toBeUndefined();
  });
});
