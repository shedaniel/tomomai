import { expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return { router: t.router, protectedProcedure: t.procedure, publicProcedure: t.procedure };
});

import { userRouter } from "./index";

it("limits public player reads to the reviewed procedures, leaving snapshots to toPublicGameSnapshot", () => {
  const publicReads = Object.keys(userRouter._def.procedures).filter(key => key.startsWith("getPublic")).sort();
  expect(publicReads).toEqual([
    "getPublicDailyPlaysAvailableDays",
    "getPublicPlateSongs",
    "getPublicPlayerStats",
    "getPublicRecentSongs",
  ]);
});
