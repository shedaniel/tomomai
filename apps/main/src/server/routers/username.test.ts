import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure };
});

import { usernameRouter } from "./username";

const now = new Date();
const caller = usernameRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "player", createdAt: now, updatedAt: now, email: "player@example.test", emailVerified: true, name: "Player", banned: false },
    session: { id: "session", userId: "player", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

beforeEach(() => proxy.reset());

it.each(["admin", "Admin", "max", "MAXBAS"])("refuses the reserved name %s before looking up accounts", async username => {
  expect(await caller.checkUsernameAvailability({ username })).toEqual({ available: false, error: "This username is reserved" });
  await expect(caller.setUsername({ username })).rejects.toMatchObject({ code: "CONFLICT", message: "This username is reserved" });
  expect(proxy.queries).toEqual([]);
});
