import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ snapshots: vi.fn(), snapshotData: vi.fn() }));

vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame("maimai", ["intl", "jp"]) };
});
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => ({ user: { id: "player" } }) }));
vi.mock("@/lib/flags", () => ({ useFlags: async () => ({}) }));
vi.mock("@/lib/trpc-server", () => ({
  createServerSideTRPC: async () => ({
    user: {
      getUserData: async () => ({ region: "intl" }),
      getSnapshots: current.snapshots,
      getSnapshotData: current.snapshotData,
    },
  }),
}));
vi.mock("@/lib/request-logger", () => ({ pageLogger: async () => ({ error: () => {} }) }));
vi.mock("@/lib/posts", () => ({ getLatestPost: () => null }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));
vi.mock("@/components/player/dashboard", () => ({ Dashboard: () => null }));
vi.mock("@/components/landing-page", () => ({ LandingPage: () => null }));
vi.mock("@/components/player/game-unavailable", () => ({ GameUnavailable: () => null }));

import Home from "./page";

type DashboardProps = { initialSnapshots: unknown[]; initialSnapshotData: unknown };

async function dashboard() {
  return (await Home() as ReactElement<DashboardProps>).props;
}

beforeEach(() => {
  current.snapshots.mockResolvedValue([{ publicId: "latest" }]);
  current.snapshotData.mockResolvedValue({ snapshot: { publicId: "latest" }, songs: [] });
});

describe("dashboard page", () => {
  it("opens an empty dashboard when the first snapshot load fails", async () => {
    current.snapshots.mockRejectedValue(new Error("database unavailable"));
    const props = await dashboard();
    expect(props.initialSnapshots).toEqual([]);
    expect(props.initialSnapshotData).toBeUndefined();
  });

  it("keeps the snapshot list when only the latest snapshot fails to load", async () => {
    current.snapshotData.mockRejectedValue(new Error("timeout"));
    const props = await dashboard();
    expect(props.initialSnapshots).toEqual([{ publicId: "latest" }]);
    expect(props.initialSnapshotData).toBeUndefined();
  });
});
