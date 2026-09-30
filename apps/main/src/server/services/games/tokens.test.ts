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

it.each(["maimai", "chunithm"] as const)("isolates every %s token operation while storing encrypted values", async game => {
  proxy.respond([{ token: encryptToken("stored-token") }]);
  expect(await readToken(game, "same-owner", "jp")).toBe("stored-token");
  await saveToken(game, "same-owner", "jp", "new-token");
  await updateToken(game, "same-owner", "jp", "refreshed-token");
  await deleteToken(game, "same-owner", "jp");

  const [read, insert, update, remove] = proxy.queries;
  expect(read.params).toEqual(["same-owner", game, "jp", 1]);
  expect(insert.sql).toMatch(/on conflict \("userId","game","region"\) do update/);
  expect(insert.params.slice(0, 3)).toEqual(["same-owner", game, "jp"]);
  expect(decryptToken(String(insert.params[3]))).toBe("new-token");
  expect(update.params.slice(-3)).toEqual(["same-owner", game, "jp"]);
  expect(decryptToken(String(update.params[0]))).toBe("refreshed-token");
  expect(remove.params).toEqual(["same-owner", game, "jp"]);
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
