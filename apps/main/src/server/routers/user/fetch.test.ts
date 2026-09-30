import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ start: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => mocks.log } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/server/services/games/fetch-sessions", () => ({ startScoreFetch: mocks.start, getScoreFetchStatus: vi.fn() }));

import { GameError } from "@/lib/games/errors";
import { FetchStartError } from "@/server/services/games/fetch-errors";
import { fetchRouter } from "./fetch";

const now = new Date("2026-09-08T20:00:00Z");
const caller = fetchRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "owner", createdAt: now, updatedAt: now, email: "owner@example.test", emailVerified: true, name: "Owner", banned: false },
    session: { id: "session", userId: "owner", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "intl,jp");
  mocks.start.mockResolvedValue({ sessionId: "fetch-session", status: "pending" });
});
afterEach(() => vi.unstubAllEnvs());

describe("startFetch", () => {
  it("rejects a region the game does not serve as a bad request before starting anything", async () => {
    await expect(caller.startFetch({ game: "chunithm", region: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it("answers maintenance as SERVICE_UNAVAILABLE with its message and logs it as expected", async () => {
    const refusal = new FetchStartError("MAINTENANCE", "Cannot fetch data during maintenance window (04:00 - 07:00 JST)", 7200);
    mocks.start.mockRejectedValueOnce(refusal);
    await expect(caller.startFetch({ game: "chunithm", region: "intl", token: "cookie://new" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "MAINTENANCE: Cannot fetch data during maintenance window (04:00 - 07:00 JST)",
      cause: refusal,
    });
    expect(mocks.start).toHaveBeenCalledWith({ game: "chunithm", region: "intl", userId: "owner", token: "cookie://new" });
    expect(mocks.log.warn).toHaveBeenCalledWith({ status: "SERVICE_UNAVAILABLE" }, expect.any(String));
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it("keeps the status of a game rejection raised while starting", async () => {
    mocks.start.mockRejectedValueOnce(new GameError("GAME_NOT_ENABLED", "CHUNITHM is not enabled", "chunithm"));
    await expect(caller.startFetch({ game: "chunithm", region: "jp" })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it("hides an unexpected failure behind a server error that is logged with its cause", async () => {
    const failure = new Error("connection reset");
    mocks.start.mockRejectedValueOnce(failure);
    await expect(caller.startFetch({ game: "chunithm", region: "jp" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to start fetch",
    });
    expect(mocks.log.error).toHaveBeenCalledOnce();
    expect(mocks.log.error.mock.calls[0][0].err.cause).toBe(failure);
  });
});
