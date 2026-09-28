import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const statements = vi.hoisted(() => [] as { sql: string; params: unknown[] }[]);
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { statements.push({ sql, params }); return { rows: [] }; }) };
});
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure, publicProcedure: t.procedure };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/profile-cache", () => ({ revalidatePublicProfileForUser: vi.fn() }));

import { snapshotsRouter } from "./snapshots";

it("scopes the export lookup to the requested game and owner before reading scores", async () => {
  const now = new Date();
  const caller = snapshotsRouter.createCaller({
    req: new NextRequest("http://localhost/api/trpc"),
    session: {
      user: { id: "same-owner", createdAt: now, updatedAt: now, email: "owner@example.test", emailVerified: true, name: "Owner", banned: false },
      session: { id: "session", userId: "same-owner", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
    },
  });
  await expect(caller.exportSnapshotData({ game: "maimai", snapshotId: "other-game-snapshot" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(statements).toHaveLength(1);
  const [query] = statements;
  expect(query.sql).toContain('"user_snapshots"."game" = $');
  expect(query.sql).toContain('"user_snapshots"."userId" = $');
  expect(query.params).toEqual(["other-game-snapshot", "maimai", "same-owner", 1]);
});
