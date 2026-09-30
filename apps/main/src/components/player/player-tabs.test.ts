import { describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import type { ProfilePrivacySettings } from "@/lib/types";
import { getVisiblePlayerTabs } from "./player-tabs";
import { testGame } from "@/test/games";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const everyFlag = { historyCard: true, albumsCard: true, eventsCard: true } as Flags;
const shareAll: ProfilePrivacySettings = {
  profileShowAllScores: true, profileShowScoreDetails: true, profileShowPlates: true,
  profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true,
};
const shareNothing: ProfilePrivacySettings = {
  profileShowAllScores: false, profileShowScoreDetails: false, profileShowPlates: false,
  profileShowPlayCounts: false, profileShowEvents: false, profileShowInSearch: false,
};
const owner = { visitedBySelf: true, privacy: shareAll, flags: everyFlag };
const maimai = testGame("maimai", ["intl", "jp", "cn"]);
const chunithm = testGame("chunithm", ["intl", "jp"]);
const tabIds = (...args: Parameters<typeof getVisiblePlayerTabs>) => getVisiblePlayerTabs(...args).map(tab => tab.id);

describe("player tabs", () => {
  it("shows the owner every maimai tab, except albums in China", () => {
    expect(tabIds(maimai, "jp", owner)).toEqual(["info", "stats", "songs", "recent", "recommendations", "history", "albums", "map", "exportImage", "developer"]);
    expect(tabIds(maimai, "cn", owner)).not.toContain("albums");
  });

  it("shows CHUNITHM only the tabs of features it has", () => {
    expect(tabIds(chunithm, "jp", owner)).toEqual(["info", "songs", "recent", "recommendations", "history"]);
  });

  it("hides owner-only, private and flagged-off tabs from a visitor", () => {
    expect(tabIds(maimai, "jp", { visitedBySelf: false, privacy: shareNothing, flags: {} as Flags })).toEqual(["info", "songs", "recommendations", "exportImage"]);
    expect(tabIds(maimai, "jp", { visitedBySelf: false, privacy: shareAll, flags: everyFlag })).toEqual(["info", "stats", "songs", "recent", "recommendations", "map", "exportImage"]);
  });
});
