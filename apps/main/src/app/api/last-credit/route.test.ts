import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: { info: vi.fn() } }) }));
vi.mock("@/lib/render-token", () => ({ renderRedirectUrl: () => "https://render.example.test/last-credit" }));
vi.mock("@/server/services/games/maimai/render/messages", () => ({ buildLastCreditMessage: mocks.build }));

import { GET } from "./route";

function request(region: string) {
  return GET(new NextRequest(`https://example.test/api/last-credit?region=${region}`));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
  mocks.session.mockReset().mockResolvedValue({ user: { id: "player" } });
  mocks.build.mockReset().mockResolvedValue({ ok: true, message: {} });
});
afterEach(() => vi.unstubAllEnvs());

it("renders only for an enabled maimai region", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
  expect((await request("jp")).status).toBe(302);
  expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ userId: "player", region: "jp" }));

  const rejected = await request("intl");
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toMatchObject({ code: "UNSUPPORTED_REGION" });
  expect(mocks.build).toHaveBeenCalledTimes(1);
});

it("reports a disabled game instead of rejecting every region as malformed", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "");
  const response = await request("jp");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ code: "GAME_NOT_ENABLED" });
  expect(mocks.build).not.toHaveBeenCalled();
});
