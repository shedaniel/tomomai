import { afterEach, beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { fetchAlbumStorageUsage } from "./albums";

beforeEach(() => {
  proxy.reset();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("sums the owner's album storage per region in one query and lists every region that offers albums", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp,intl,cn");
  // cn keeps its stored photos in the total although albums are not offered there any more.
  proxy.answer(({ params }) => params.includes("maimai") && params.includes("owner") ? [{ region: "jp", size: "300" }, { region: "cn", size: "50" }] : []);
  await expect(fetchAlbumStorageUsage("maimai", "owner")).resolves.toEqual({
    totalUsed: 350,
    byRegion: [{ region: "intl", used: 0 }, { region: "jp", used: 300 }],
  });
  expect(proxy.queries).toHaveLength(1);
  await expect(fetchAlbumStorageUsage("maimai", "stranger")).resolves.toMatchObject({ totalUsed: 0 });
});
