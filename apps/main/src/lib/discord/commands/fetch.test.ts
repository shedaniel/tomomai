import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  edit: vi.fn(),
  deferred: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async () => ({ rows: [["user-1", "Player", "player", "intl"]] })) };
});
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.deferred }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("@/server/services/games/fetch-sessions", () => ({ startScoreFetch: mocks.start, getScoreFetchStatus: vi.fn() }));
vi.mock("../image-utils", () => ({ generateAndSendProfileImage: vi.fn() }));
vi.mock("../responses", async importOriginal => ({ ...await importOriginal<typeof import("../responses")>(), editDiscordMessage: mocks.edit }));

import { FetchStartError } from "@/server/services/games/fetch-errors";
import { handleFetchCommand, runFetchSession } from "./fetch";

const session = { userId: "user-1", username: "player", region: "intl" as const, regionName: "International", discordUserId: "discord-1", applicationId: "app", interactionToken: "token" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // A Tuesday in International maintenance, 01:00 to 02:00 JST.
  vi.setSystemTime(new Date("2026-09-08T01:30:00+09:00"));
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("answers /fetch during maintenance with the scheduled window before deferring", async () => {
  const response = await handleFetchCommand({ discordUserId: "discord-1", applicationId: "app", interactionToken: "token", locale: "ja" });
  expect(response.data?.content).toBe("現在メンテナンス時間中（日本時間 01:00〜02:00）のため、データ同期はできません。");
  expect(mocks.deferred).not.toHaveBeenCalled();
});

it("explains a maintenance refusal that raced the check with the localized window", async () => {
  mocks.start.mockRejectedValueOnce(new FetchStartError("MAINTENANCE", "Cannot fetch data during maintenance window (01:00 - 02:00 JST)", 1800));
  await expect(runFetchSession({ ...session, locale: "ja" })).resolves.toBe(false);
  const [, , message] = mocks.edit.mock.calls[0];
  expect(message.embeds[0].description).toBe("<@discord-1> データの同期中にエラーが発生しました：現在メンテナンス時間中（日本時間 01:00〜02:00）のため、データ同期はできません。");
  expect(mocks.log.error).not.toHaveBeenCalled();
});

it("keeps the refusal's own window once that maintenance has ended", async () => {
  vi.setSystemTime(new Date("2026-09-08T02:00:00+09:00"));
  const refusal = new FetchStartError("MAINTENANCE", "Cannot fetch data during maintenance window (01:00 - 02:00 JST)", 1);
  mocks.start.mockRejectedValueOnce(refusal);
  await runFetchSession({ ...session, locale: "ja" });
  const [, , message] = mocks.edit.mock.calls[0];
  expect(message.embeds[0].description).toBe(`<@discord-1> データの同期中にエラーが発生しました：${refusal.message}`);
});

it("asks for the album preference when the fetch needs one", async () => {
  vi.setSystemTime(new Date("2026-09-08T12:00:00+09:00"));
  mocks.start.mockRejectedValueOnce(new FetchStartError("NO_USE_ALBUMS_SETTINGS", "No fetch albums settings preference set."));
  await expect(runFetchSession(session)).resolves.toBe(false);
  const [, , message] = mocks.edit.mock.calls[0];
  expect(message.components[0].components.map((button: { custom_id: string }) => button.custom_id)).toEqual([
    "album_preference_discord-1_intl_0", "album_preference_discord-1_intl_1",
  ]);
});
