import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId, regions: [] as Region[] }));

vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame(current.game, current.regions) };
});
vi.mock("@/components/db/db-layout-client", () => ({ DbLayoutClient: () => null }));
vi.mock("@/components/db/song-detail-drawer", () => ({ SongDetailDrawer: () => null }));

import DbLayout from "./layout";

async function navigation(game: CanonicalGameId, regions: Region[]) {
  Object.assign(current, { game, regions });
  const layout = await DbLayout({ children: null, detail: null });
  const [client] = layout.props.children as [ReactElement<{ types: readonly string[] }>];
  return client.props.types;
}

describe("database navigation", () => {
  it("lists only the songs catalog on the CHUNITHM site", async () => {
    expect(await navigation("chunithm", ["intl", "jp"])).toEqual(["songs"]);
  });

  it("lists every maimai section except the hidden arcade map", async () => {
    expect(await navigation("maimai", ["intl", "jp"])).toEqual(["songs", "stats", "events", "posts"]);
  });

  it("lists only the catalog while the game has no enabled region", async () => {
    expect(await navigation("maimai", [])).toEqual(["songs"]);
  });
});
