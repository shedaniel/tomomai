import { expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.meta<{ access: "public" | "protected" }>().create();
  return {
    router: t.router,
    protectedProcedure: t.procedure.meta({ access: "protected" }),
    publicProcedure: t.procedure.meta({ access: "public" }),
  };
});

import { userRouter } from "./index";

type AccessDef = { _def: { meta?: { access: "public" | "protected" } } };

it("limits anonymous user procedures to the reviewed list, leaving snapshots to toPublicGameSnapshot", () => {
  const procedures = Object.entries(userRouter._def.procedures as Record<string, AccessDef>);
  expect(procedures.filter(([, procedure]) => !procedure._def.meta).map(([key]) => key)).toEqual([]);
  expect(procedures.filter(([, procedure]) => procedure._def.meta?.access === "public").map(([key]) => key).sort()).toEqual([
    "getAllUniqueSongs",
    "getChartPercentiles",
    "getCnProxyConfigured",
    "getDivingFishConfigured",
    "getLxnsOAuthConfigured",
    "getPolicies",
    "getPublicDailyPlaysAvailableDays",
    "getPublicPlateSongs",
    "getPublicPlayerStats",
    "getPublicRecentSongs",
    "getRecommendationPeers",
    "getSignupRequirements",
    "getSimpleSongDetails",
    "getSongDetails",
    "getUserSelectableFlags",
    "validateInvite",
  ]);
});
