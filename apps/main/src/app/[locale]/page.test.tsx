import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

const current = vi.hoisted(() => ({
  game: "maimai" as CanonicalGameId,
  regions: ["intl", "jp"] as Region[],
  userRegion: "intl",
  snapshots: vi.fn(),
  snapshotData: vi.fn(),
  session: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async (namespace: string) => createTranslator({
      locale: "en",
      messages: await loadMessages(current.game, "en"),
      namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), current.regions) };
});
vi.mock("@/lib/auth-server", () => ({ getServerSession: current.session }));
vi.mock("@/lib/flags", () => ({ useFlags: async () => ({}) }));
vi.mock("@/lib/trpc-server", () => ({
  createServerSideTRPC: async () => ({
    user: {
      getUserData: async () => ({ region: current.userRegion }),
      getSnapshots: current.snapshots,
      getSnapshotData: current.snapshotData,
    },
  }),
}));
vi.mock("@/lib/request-logger", () => ({ pageLogger: async () => ({ error: current.logError }) }));
vi.mock("@/lib/posts", () => ({ getLatestPost: () => ({ slug: "2026-09-01-update" }) }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/components/player/dashboard", () => ({ Dashboard: () => null }));
vi.mock("@/components/login-screen", () => ({ LoginScreen: () => null }));
vi.mock("@/components/auth-handler", () => ({ AuthHandler: () => null }));
vi.mock("@/components/player/game-unavailable", () => ({ GameUnavailable: () => null }));

import Home, { generateMetadata } from "./page";
import { GameUnavailable } from "@/components/player/game-unavailable";

type DashboardProps = { initialRegion: Region; initialSnapshots: unknown[]; initialSnapshotData: unknown; latestPost: unknown };

async function dashboard(game: CanonicalGameId = "maimai") {
  current.game = game;
  return (await Home() as ReactElement<DashboardProps>).props;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(current, { game: "maimai", regions: ["intl", "jp"], userRegion: "intl" });
  current.session.mockResolvedValue({ user: { id: "player" } });
  current.snapshots.mockResolvedValue([{ publicId: "latest" }]);
  current.snapshotData.mockResolvedValue({ snapshot: { publicId: "latest" }, songs: [] });
});

describe("dashboard page", () => {
  it("shows the unavailable screen for a game with no enabled region before touching the session", async () => {
    current.regions = [];
    const page = await Home() as ReactElement;
    expect(page.type).toBe(GameUnavailable);
    expect(current.session).not.toHaveBeenCalled();
  });

  it("opens the dashboard in the user's region, or the game's first region when it does not enable theirs", async () => {
    current.userRegion = "jp";
    expect((await dashboard()).initialRegion).toBe("jp");
    current.userRegion = "cn";
    const props = await dashboard();
    expect(props.initialRegion).toBe("intl");
    expect(current.snapshots).toHaveBeenLastCalledWith({ game: "maimai", region: "intl" });
    expect(props.initialSnapshots).toEqual([{ publicId: "latest" }]);
    expect(props.initialSnapshotData).toEqual({ snapshot: { publicId: "latest" }, songs: [] });
  });

  it("opens an empty dashboard and logs when the first snapshot load fails", async () => {
    const err = new Error("database unavailable");
    current.snapshots.mockRejectedValue(err);
    const props = await dashboard();
    expect(props.initialSnapshots).toEqual([]);
    expect(props.initialSnapshotData).toBeUndefined();
    expect(current.logError).toHaveBeenCalledWith({ err, game: "maimai", region: "intl" }, "Dashboard initial snapshot load failed");
  });

  it("keeps the snapshot list when only the latest snapshot fails to load", async () => {
    current.snapshotData.mockRejectedValue(new Error("timeout"));
    const props = await dashboard();
    expect(props.initialSnapshots).toEqual([{ publicId: "latest" }]);
    expect(props.initialSnapshotData).toBeUndefined();
  });

  it("links the home image for every game", async () => {
    for (const game of ["maimai", "chunithm"] as const) {
      current.game = game;
      expect((await generateMetadata()).openGraph?.images).toEqual([{ url: "https://site.test/en/opengraph-image/en" }]);
    }
  });
});

describe("dashboard changelog", () => {
  it("announces the latest post on the maimai site", async () => {
    expect((await dashboard("maimai")).latestPost).toEqual({ slug: "2026-09-01-update" });
  });

  it("announces no post on a site without the changelog", async () => {
    expect((await dashboard("chunithm")).latestPost).toBeNull();
  });
});
