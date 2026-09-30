import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queries = vi.hoisted(() => ({ fetchUserData: vi.fn(), fetchProfileSettings: vi.fn() }));
vi.mock("@/server/queries/profile", () => queries);
vi.mock("@/lib/api/protect", () => ({
  withApiKey: (_spec: unknown, handler: (req: NextRequest, key: { userId: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "owner" }),
}));

import { GET as getMe } from "./route";
import { GET as getSettings } from "./settings/route";

const request = new NextRequest("http://localhost/api/v1/me");
const settings = {
  publishProfile: true, profileDescription: null, profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlates: true,
  profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true, fetchUseAlbums: null,
};

async function read(route: typeof getMe) {
  const response = await route(request, { params: Promise.resolve({}) });
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
});
afterEach(() => vi.unstubAllEnvs());

it("answers the preferences of the site's game", async () => {
  queries.fetchUserData.mockResolvedValue({ username: "player", email: "player@example.test", publishProfile: true, role: "user", region: "jp" });
  queries.fetchProfileSettings.mockResolvedValue({ ...settings, profileMainRegion: "jp" });
  await expect(read(getMe)).resolves.toEqual({ username: "player", region: "jp", publishProfile: true, role: "user" });
  await expect(read(getSettings)).resolves.toMatchObject({ profileMainRegion: "jp" });
  expect(queries.fetchUserData).toHaveBeenCalledWith("chunithm", "owner");
  expect(queries.fetchProfileSettings).toHaveBeenCalledWith("chunithm", "owner");
});

it("answers the game's first region for a preference it does not enable or no preference", async () => {
  queries.fetchUserData.mockResolvedValue({ username: "player", email: "player@example.test", publishProfile: false, role: "user", region: null });
  queries.fetchProfileSettings.mockResolvedValue({ ...settings, profileMainRegion: "cn" });
  await expect(read(getMe)).resolves.toMatchObject({ region: "intl" });
  await expect(read(getSettings)).resolves.toMatchObject({ profileMainRegion: "intl" });
});

it("keeps a maimai preference on the maimai site", async () => {
  vi.stubEnv("FRONTEND_GAME", "maimai");
  queries.fetchProfileSettings.mockResolvedValue({ ...settings, profileMainRegion: "cn" });
  await expect(read(getSettings)).resolves.toMatchObject({ profileMainRegion: "cn" });
  expect(queries.fetchProfileSettings).toHaveBeenCalledWith("maimai", "owner");
});
