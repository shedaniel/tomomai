import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { beforeEach, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => log }));

import { GameError } from "@/lib/games/errors";
import type { FetchStartErrorCode } from "@/lib/games/fetch-error-codes";
import { FetchStartError, toTrpcFetchStartError } from "@/server/services/games/fetch-errors";
import { mapFetchStartError } from "./fetch-errors";

const PUBLIC_STATUS: Record<FetchStartErrorCode, number> = {
  NO_TOKEN_FOUND: 412,
  TOKEN_UNREADABLE: 412,
  CN_COOKIES_SINGLE_USE: 412,
  NO_USE_ALBUMS_SETTINGS: 412,
  MAINTENANCE: 503,
  FETCH_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
};

beforeEach(() => vi.clearAllMocks());

it.each(Object.entries(PUBLIC_STATUS) as [FetchStartErrorCode, number][])("answers %s with %i over REST and through tRPC", async (code, status) => {
  const error = new FetchStartError(code, "Refused");
  const response = mapFetchStartError(error);
  expect(response.status).toBe(status);
  expect(response.headers.has("Retry-After")).toBe(false);
  expect(await response.json()).toEqual({ error: `${code}: Refused`, code });

  const trpcError = toTrpcFetchStartError(error);
  expect(trpcError).toMatchObject({ message: `${code}: Refused`, cause: error });
  expect(getHTTPStatusCodeFromError(trpcError)).toBe(status);
  expect(log.error).not.toHaveBeenCalled();
});

it.each(["MAINTENANCE", "RATE_LIMITED"] as const)("tells REST callers when to retry after %s", code => {
  expect(mapFetchStartError(new FetchStartError(code, "Later", 5400)).headers.get("Retry-After")).toBe("5400");
});

it("answers game rejections with their own status and hides unexpected failures", async () => {
  const rejected = mapFetchStartError(new GameError("UNSUPPORTED_REGION", "No CN site"));
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: "No CN site", code: "UNSUPPORTED_REGION" });

  const failed = mapFetchStartError(new Error("connection reset"));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "Failed to start fetch" });
  expect(log.error).toHaveBeenCalledOnce();
});
