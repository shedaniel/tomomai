import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GAME_CODES } from "@/lib/games/codes";
import { GET } from "./route";

function get(game: string) {
  return GET(new NextRequest(`https://example.test/api/v1/games/${game}/codes`), { params: Promise.resolve({ game }) });
}

describe("game code dictionary", () => {
  it.each(["maimai", "chunithm"] as const)("publishes the %s code table with a day of public caching", async game => {
    const response = await get(game);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ game, ...GAME_CODES[game] });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=86400");
  });

  it("lists keys in code order", async () => {
    const codes = await (await get("chunithm")).json();
    expect(codes.difficulty.indexOf("ultima")).toBe(4);
    expect(codes.clearStatus.indexOf("hard")).toBe(2);
  });

  it("rejects an unknown game", async () => {
    const response = await get("ongeki");
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNKNOWN_GAME");
  });
});
