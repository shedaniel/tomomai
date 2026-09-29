import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const services = vi.hoisted(() => ({ read: vi.fn(), copy: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure, publicProcedure: t.procedure };
});
vi.mock("@/lib/profile-cache", () => ({ revalidatePublicProfileForUser: services.revalidate }));
vi.mock("@/server/queries/snapshots", () => ({ fetchSnapshotDataByPublicId: services.read }));
vi.mock("@/server/services/games/snapshot-copy", () => ({ copySnapshotToVersion: services.copy }));

import { snapshotToolsRouter } from "./snapshot-tools";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
});
afterEach(() => vi.unstubAllEnvs());

function caller() {
  const now = new Date();
  return snapshotToolsRouter.createCaller({
    req: new NextRequest("http://localhost/api/trpc"),
    session: {
      user: { id: "same-owner", createdAt: now, updatedAt: now, email: "owner@example.test", emailVerified: true, name: "Owner", banned: false },
      session: { id: "session", userId: "same-owner", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
    },
  });
}

it("answers NOT_FOUND when the owner has no maimai snapshot with that id", async () => {
  services.read.mockResolvedValueOnce(null);
  await expect(caller().exportSnapshotData({ snapshotId: "other-game-snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(services.read).toHaveBeenCalledWith("maimai", "same-owner", "other-game-snapshot");
});

it("answers NOT_FOUND for a snapshot the copy service cannot find, without revalidating", async () => {
  services.copy.mockResolvedValueOnce(null);
  await expect(caller().copySnapshotToVersion({ snapshotId: "missing", region: "jp", targetVersion: 13 }))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(services.copy).toHaveBeenCalledWith({ game: "maimai", userId: "same-owner", snapshotPublicId: "missing", region: "jp", targetVersion: 13 });
  expect(services.revalidate).not.toHaveBeenCalled();
});

it("revalidates the public profile once the copy has committed", async () => {
  const copied = { newSnapshotId: "copy", copiedScores: 1, totalOriginalScores: 2, originalRating: 12000, newRating: 12100 };
  services.copy.mockResolvedValueOnce(copied);
  await expect(caller().copySnapshotToVersion({ snapshotId: "source", region: "jp", targetVersion: 13 }))
    .resolves.toEqual({ success: true, ...copied });
  expect(services.revalidate).toHaveBeenCalledWith("maimai", "same-owner", ["jp"]);
});
