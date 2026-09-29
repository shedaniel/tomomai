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

import { maimaiRouter } from "./maimai";
import { userRouter } from "./user";

type AccessDef = { _def: { meta?: { access: "public" | "protected" } } };

it.each([
  {
    name: "user",
    router: userRouter,
    anonymous: [
      "getAllUniqueSongs",
      "getPolicies",
      "getPublicPlayerStats",
      "getPublicRecentSongs",
      "getSignupRequirements",
      "getSimpleSongDetails",
      "getSongDetails",
      "getUserSelectableFlags",
      "validateInvite",
    ],
  },
  {
    name: "maimai",
    router: maimaiRouter,
    anonymous: [
      "getCatalogStats",
      "getChartPercentiles",
      "getCnProxyConfigured",
      "getDivingFishConfigured",
      "getEventStepsByNames",
      "getEvents",
      "getLxnsOAuthConfigured",
      "getPublicDailyPlaysAvailableDays",
      "getPublicPlateSongs",
      "getRecommendationPeers",
      "getTopSongs",
    ],
  },
])("limits anonymous $name procedures to the reviewed list, leaving snapshots to toPublicGameSnapshot", ({ router, anonymous }) => {
  const procedures = Object.entries(router._def.procedures as Record<string, AccessDef>);
  expect(procedures.filter(([, procedure]) => !procedure._def.meta).map(([key]) => key)).toEqual([]);
  expect(procedures.filter(([, procedure]) => procedure._def.meta?.access === "public").map(([key]) => key).sort()).toEqual(anonymous);
});
