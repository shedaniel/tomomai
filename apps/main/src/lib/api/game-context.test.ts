import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolveApiGame } from "./game-context";
import { defineRoute, findRouteByRequest } from "./registry";
import { z } from "zod";

const request = (region = "jp") => new NextRequest(`https://example.test/api/v1/games/maimai/songs?region=${region}`);
const context = (game: string) => ({ params: Promise.resolve({ game }) });

afterEach(() => vi.unstubAllEnvs());

describe("game API boundaries", () => {
  it("requires canonical IDs and enabled game regions", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
    expect(await resolveApiGame(request(), context("maimai"), "catalog")).toBe("maimai");
    for (const game of ["maimaidx", "unknown", ""]) {
      const result = await resolveApiGame(request(), context(game), "catalog") as Response;
      expect(result.status).toBe(400);
      expect((await result.json()).code).toBe("UNKNOWN_GAME");
    }
    for (const req of [request(), new NextRequest("https://example.test/api/v1/games/chunithm/fetch")]) {
      expect(await resolveApiGame(req, context("chunithm"), "scores")).toBe("chunithm");
    }
    const region = await resolveApiGame(request("cn"), context("maimai"), "scores") as Response;
    expect((await region.json()).code).toBe("UNSUPPORTED_REGION");
  });

  it("matches static resources ahead of dynamic IDs", () => {
    const base = { method: "GET" as const, tag: "test", summary: "test", scope: "public" as const, cost: 1, response: z.object({}) };
    defineRoute({ ...base, path: "/api/v1/games/{game}/test/{id}" });
    const spec = defineRoute({ ...base, path: "/api/v1/games/{game}/test/latest" });
    expect(findRouteByRequest("GET", "/api/v1/games/maimai/test/latest")).toBe(spec);
  });
});
