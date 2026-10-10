import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }));

import { GameError } from "@/lib/games/errors";
import { publicProcedure, router } from "@/lib/trpc";
import { gameOnlyProcedure, gameProcedure } from "./game-procedures";
import { maimaiProcedure, maimaiRegionProcedure } from "./maimai/procedures";

const probe = router({
  scores: gameProcedure(publicProcedure, "scores").query(({ ctx }) => ({ game: ctx.game, region: ctx.region })),
  albums: gameProcedure(publicProcedure, "albums").query(({ ctx }) => ctx.game),
  percentiles: gameOnlyProcedure(publicProcedure, "percentiles").query(({ ctx }) => ctx.game),
  maimaiPercentiles: maimaiProcedure(publicProcedure, "percentiles").query(({ ctx }) => ctx.game),
  maimaiAlbums: maimaiRegionProcedure(publicProcedure, "albums").query(({ ctx }) => ({ game: ctx.game, region: ctx.region })),
  deepRejection: publicProcedure.query(() => {
    throw new GameError("UNSUPPORTED_REGION", "No such site", "chunithm", "cn");
  }),
});
const caller = probe.createCaller({ session: null, req: new NextRequest("http://localhost/api/trpc") });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("game procedures", () => {
  it("puts the resolved game and region on the context", async () => {
    await expect(caller.scores({ game: "chunithm", region: "jp" })).resolves.toEqual({ game: "chunithm", region: "jp" });
  });

  it("answers an unsupported region with BAD_REQUEST and a missing capability with UNPROCESSABLE_CONTENT", async () => {
    await expect(caller.scores({ game: "chunithm", region: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.albums({ game: "chunithm", region: "jp" })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    await expect(caller.albums({ game: "maimai", region: "cn" })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("maps a game rejection thrown inside a handler instead of failing with a server error", async () => {
    await expect(caller.deepRejection()).rejects.toMatchObject({ code: "BAD_REQUEST", message: "No such site" });
    expect(log.warn).toHaveBeenCalledWith({ status: "BAD_REQUEST" }, expect.any(String));
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe("maimai procedures", () => {
  it("keeps a maimai-only capability out of CHUNITHM's reach", async () => {
    await expect(caller.percentiles({ game: "chunithm" })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    const input = { game: "chunithm" } as unknown as void;
    await expect(caller.maimaiPercentiles(input)).resolves.toBe("maimai");
  });

  it("still checks maimai's own capability and regions", async () => {
    await expect(caller.maimaiAlbums({ region: "intl" })).resolves.toEqual({ game: "maimai", region: "intl" });
    await expect(caller.maimaiAlbums({ region: "cn" })).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
    await expect(caller.maimaiAlbums({ region: "intl" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
    await expect(caller.maimaiPercentiles()).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });
});
