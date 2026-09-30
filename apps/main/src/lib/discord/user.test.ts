import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { findDiscordUser } from "./user";

beforeEach(() => proxy.reset());

it("reads the account linked to the Discord user with its maimai region preference", async () => {
  // The account answers only a lookup of its Discord link that reads the bot game's preference.
  proxy.answer(({ params }) => params.includes("discord-1") && params.includes("discord") && params.includes("maimai")
    ? [{ id: "user-1", name: "Player", username: "player", region: "jp" }]
    : []);
  await expect(findDiscordUser("discord-1")).resolves.toEqual({ id: "user-1", name: "Player", username: "player", region: "jp" });
  await expect(findDiscordUser("discord-2")).resolves.toBeNull();
});
