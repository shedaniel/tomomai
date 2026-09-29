import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, getCurrentGame } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getCurrentGame: vi.fn(() => ({ id: "maimai" })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/games/current", () => ({ getCurrentGame }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { revalidatePublicProfile, revalidateCurrentSitePublicProfile } from "./profile-cache";

beforeEach(() => { vi.clearAllMocks(); getCurrentGame.mockReturnValue({ id: "maimai" }); });

describe("public profile invalidation", () => {
  it.each(["maimai", "chunithm"])("does not invalidate %s pages for another game's ingestion", game => {
    getCurrentGame.mockReturnValue({ id: game });
    revalidatePublicProfile(game === "maimai" ? "chunithm" : "maimai", ["alice"], ["jp"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["maimai", "chunithm"] as const)("invalidates %s localized profile paths", game => {
    getCurrentGame.mockReturnValue({ id: game });
    revalidatePublicProfile(game, ["alice", "alice"], ["jp"]);
    expect(revalidatePath).toHaveBeenCalledWith("/ja/profile/alice/jp", "page");
    expect(revalidatePath.mock.calls.every(([path]) => String(path).endsWith("/profile/alice/jp"))).toBe(true);
  });

  it.each(["maimai", "chunithm"])("invalidates the %s site after account-wide settings change", game => {
    getCurrentGame.mockReturnValue({ id: game });
    revalidateCurrentSitePublicProfile(["alice"], ["intl"]);
    expect(revalidatePath).toHaveBeenCalledWith("/en/profile/alice/intl", "page");
  });
});
