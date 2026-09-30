import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/server/queries/public-access", () => ({ resolvePublicSnapshotAccess: mocks.access }));

import { playsOwnerQuery, resolvePlaysOwner } from "./plays-owner";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "jp");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_REGIONS", undefined);
  mocks.session.mockReset().mockResolvedValue({ user: { id: "viewer" } });
  mocks.access.mockReset().mockResolvedValue({ userId: "owner", region: "jp" });
});
afterEach(() => vi.unstubAllEnvs());

it("takes a snapshot for a visitor and a region for the owner", () => {
  expect(playsOwnerQuery.parse({ snapshotId: "snapshot", region: "intl" })).toEqual({ snapshotId: "snapshot" });
  expect(playsOwnerQuery.parse({ region: "jp" })).toEqual({ region: "jp" });
  expect(playsOwnerQuery.safeParse({}).success).toBe(false);
});

it("shows a visitor the snapshot owner's plays in the snapshot's region, when the owner shares them", async () => {
  await expect(resolvePlaysOwner({ snapshotId: "snapshot" }, "daily-plays")).resolves.toEqual({ userId: "owner", region: "jp" });
  expect(mocks.access).toHaveBeenCalledWith("maimai", "snapshot", { capability: "daily-plays", view: "recentPlays" });
  expect(mocks.session).not.toHaveBeenCalled();
});

it("answers 404 for a snapshot a visitor may not see", async () => {
  mocks.access.mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND" }));
  const response = await resolvePlaysOwner({ snapshotId: "hidden" }, "image-export");
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(404);
});

it("shows the signed-in owner their plays in an enabled region", async () => {
  await expect(resolvePlaysOwner({ region: "jp" }, "image-export")).resolves.toEqual({ userId: "viewer", region: "jp" });
  expect(mocks.access).not.toHaveBeenCalled();

  const refused = await resolvePlaysOwner({ region: "intl" }, "image-export") as Response;
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ code: "UNSUPPORTED_REGION" });

  mocks.session.mockResolvedValueOnce(null);
  expect((await resolvePlaysOwner({ region: "jp" }, "image-export") as Response).status).toBe(401);
});
