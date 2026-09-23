import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, getFrontendGame } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getFrontendGame: vi.fn(() => ({ id: "maimai" })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/games/frontend-server", () => ({ getFrontendGame }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { revalidatePublicProfile, revalidateCurrentSitePublicProfile } from "./profile-cache";

beforeEach(() => vi.clearAllMocks());

describe("public profile invalidation", () => {
  it("does not invalidate maimai pages for another game's ingestion", () => {
    revalidatePublicProfile("chunithm", ["alice"], ["jp"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("invalidates the current game's localized profile paths", () => {
    revalidatePublicProfile("maimai", ["alice", "alice"], ["jp"]);
    expect(revalidatePath).toHaveBeenCalledWith("/ja/profile/alice/jp", "page");
    expect(revalidatePath.mock.calls.every(([path]) => String(path).endsWith("/profile/alice/jp"))).toBe(true);
  });

  it("resolves account-wide settings through the named current-site boundary", () => {
    revalidateCurrentSitePublicProfile(["alice"], ["intl"]);
    expect(getFrontendGame).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/en/profile/alice/intl", "page");
  });
});
