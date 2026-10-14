import { afterEach, beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { deleteToken, readToken, saveToken, updateToken } from "./tokens";

beforeEach(() => {
  proxy.reset();
  vi.stubEnv("TOKEN_SECRET", "12".repeat(32));
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  { game: "maimai", other: "chunithm" },
  { game: "chunithm", other: "maimai" },
] as const)("keeps every $game token operation to the owner's token of the game and region, stored encrypted", async ({ game, other }) => {
  // The stored token answers only a read that names its owner, game and region.
  proxy.answer(({ params }) => ["same-owner", game, "jp"].every(value => params.includes(value)) ? [{ token: encryptToken("stored-token") }] : []);
  expect(await readToken(game, "same-owner", "jp")).toBe("stored-token");
  expect(await readToken(other, "same-owner", "jp")).toBeNull();
  expect(await readToken(game, "stranger", "jp")).toBeNull();
  expect(await readToken(game, "same-owner", "intl")).toBeNull();

  proxy.reset();
  await saveToken(game, "same-owner", "jp", "new-token");
  await updateToken(game, "same-owner", "jp", "refreshed-token");
  await deleteToken(game, "same-owner", "jp");

  const [saved] = proxy.inserted("user_tokens");
  expect(saved).toMatchObject({ userId: "same-owner", game, region: "jp" });
  expect(decryptToken(String(saved.token))).toBe("new-token");
  // Only the statement shows that saving again replaces the token of that owner, game and region.
  expect(proxy.queries[0].sql).toMatch(/on conflict \("userId","game","region"\) do update/);
  const [updated] = proxy.updated("user_tokens");
  expect(updated.where).toEqual(["same-owner", game, "jp"]);
  expect(decryptToken(String(updated.values.token))).toBe("refreshed-token");
  expect(proxy.queries[2]).toMatchObject({ sql: expect.stringMatching(/^delete from "user_tokens" /), params: ["same-owner", game, "jp"] });
});

it("distinguishes a missing token from unreadable stored credentials", async () => {
  expect(await readToken("chunithm", "owner", "intl")).toBeNull();
  proxy.respond([{ token: "invalid-ciphertext" }]);
  await expect(readToken("chunithm", "owner", "intl")).rejects.toMatchObject({
    code: "TOKEN_UNREADABLE",
    message: "TOKEN_UNREADABLE: Failed to decrypt stored token. Please re-add your authentication tokens.",
  });
  expect(proxy.queries.every(query => query.sql.startsWith("select"))).toBe(true);
});
