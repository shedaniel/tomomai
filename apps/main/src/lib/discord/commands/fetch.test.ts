import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  edit: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../user", () => ({ findDiscordUser: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("@/server/services/games/fetch-sessions", () => ({ startScoreFetch: mocks.start, getScoreFetchStatus: vi.fn() }));
vi.mock("../image-utils", () => ({ generateAndSendProfileImage: vi.fn() }));
vi.mock("../responses", async importOriginal => ({ ...await importOriginal<typeof import("../responses")>(), editDiscordMessage: mocks.edit }));

import { FetchStartError } from "@/server/services/games/fetch-errors";
import { runFetchSession } from "./fetch";

const session = { userId: "user-1", username: "player", region: "intl" as const, regionName: "International", discordUserId: "discord-1", applicationId: "app", interactionToken: "token" };

beforeEach(() => vi.clearAllMocks());

it("asks for the album preference when the fetch needs one", async () => {
  mocks.start.mockRejectedValueOnce(new FetchStartError("NO_USE_ALBUMS_SETTINGS", "No fetch albums settings preference set."));
  await expect(runFetchSession(session)).resolves.toBe(false);
  const [, , message] = mocks.edit.mock.calls[0];
  expect(message.components[0].components.map((button: { custom_id: string }) => button.custom_id)).toEqual([
    "album_preference_discord-1_intl_0", "album_preference_discord-1_intl_1",
  ]);
});
