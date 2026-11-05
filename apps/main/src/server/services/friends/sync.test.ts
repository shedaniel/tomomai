import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
const friends = vi.hoisted(() => ({ areFriends: vi.fn() }));
vi.mock("./queries", () => friends);

import { hideFriend } from "./sync";

beforeEach(() => {
  proxy.reset();
  friends.areFriends.mockReset();
});

it("hides a matched friend", async () => {
  friends.areFriends.mockResolvedValue(true);
  await expect(hideFriend("maimai", "me", "friend")).resolves.toBe(true);
  expect(friends.areFriends).toHaveBeenCalledWith("maimai", "me", "friend");
  expect(proxy.queries.map(query => query.table)).toEqual(["friend_hides"]);
});

it("refuses anyone who is not a matched friend without writing a hide", async () => {
  friends.areFriends.mockResolvedValue(false);
  await expect(hideFriend("maimai", "me", "stranger")).resolves.toBe(false);
  expect(proxy.queries).toEqual([]);
});
