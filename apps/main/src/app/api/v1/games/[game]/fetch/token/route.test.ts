import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { saveToken, userscriptFetch } = vi.hoisted(() => ({ saveToken: vi.fn(), userscriptFetch: vi.fn() }));

vi.mock("@/server/services/games/tokens", () => ({ saveToken, deleteToken: vi.fn() }));
vi.mock("@/lib/flags", () => ({
  resolveFlagsForUser: async (userId: string) => ({ userscriptFetch: await userscriptFetch(userId) }),
}));
// Authentication and metering have their own tests, so the handler runs as an already verified key.
vi.mock("@/lib/api/protect", async () => {
  const { bindGameRoute } = await import("@/lib/api/route");
  return {
    defineGameHandler: (spec: Parameters<typeof bindGameRoute>[0], handler: Parameters<typeof bindGameRoute>[1]) => {
      const serve = bindGameRoute(spec, handler);
      return (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
        serve(req, context, { key: { userId: "user-1" } });
    },
  };
});

import { PUT } from "./route";

const CLAL = "a".repeat(32) + "B".repeat(32);

function put(region: string, body: unknown) {
  const req = new NextRequest(`https://tomomai.test/api/v1/games/maimai/fetch/token?region=${region}`, {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ game: "maimai" }) });
}

beforeEach(() => {
  saveToken.mockReset();
  userscriptFetch.mockReset().mockResolvedValue(true);
});

describe("PUT /api/v1/games/{game}/fetch/token", () => {
  it("saves the cookie as the region's token", async () => {
    const res = await put("intl", { clal: CLAL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ game: "maimai", success: true });
    expect(saveToken).toHaveBeenCalledWith("maimai", "user-1", "intl", `cookie://${CLAL}`);
  });

  it.each([
    ["a short value", { clal: "abc" }],
    ["a prefixed value", { clal: `clal=${CLAL}` }],
    ["no clal", {}],
    ["a body that is not JSON", "clal"],
  ])("refuses %s", async (_name, body) => {
    const res = await put("intl", body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_PARAMETER");
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("answers 404 while the userscript flag is off for the key's user", async () => {
    userscriptFetch.mockResolvedValue(false);
    const res = await put("intl", { clal: CLAL });
    expect(res.status).toBe(404);
    expect(userscriptFetch).toHaveBeenCalledWith("user-1");
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("refuses a region that does not sign in with a cookie", async () => {
    const res = await put("jp", { clal: CLAL });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("COOKIE_SIGN_IN_UNSUPPORTED");
    expect(saveToken).not.toHaveBeenCalled();
  });
});
