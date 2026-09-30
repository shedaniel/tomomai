import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId }));

vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), ["intl", "jp"]) };
});
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => ({ user: { id: "player" } }) }));
vi.mock("@/lib/flags", () => ({ useFlags: async () => ({}) }));
vi.mock("@/lib/trpc-server", () => ({
  createServerSideTRPC: async () => ({
    user: { getUserData: async () => ({ region: "intl" }), getSnapshots: async () => [] },
  }),
}));
vi.mock("@/lib/posts", () => ({ getLatestPost: () => ({ slug: "2026-09-01-update" }) }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));
vi.mock("@/components/player/dashboard", () => ({ Dashboard: () => null }));
vi.mock("@/components/login-screen", () => ({ LoginScreen: () => null }));
vi.mock("@/components/auth-handler", () => ({ AuthHandler: () => null }));
vi.mock("@/components/player/game-unavailable", () => ({ GameUnavailable: () => null }));

import Home from "./page";

async function changelogPost(game: CanonicalGameId) {
  current.game = game;
  const dashboard = await Home() as ReactElement<{ latestPost: unknown }>;
  return dashboard.props.latestPost;
}

describe("dashboard changelog", () => {
  it("announces the latest post on the maimai site", async () => {
    expect(await changelogPost("maimai")).toEqual({ slug: "2026-09-01-update" });
  });

  it("announces no post on a site without the changelog", async () => {
    expect(await changelogPost("chunithm")).toBeNull();
  });
});
