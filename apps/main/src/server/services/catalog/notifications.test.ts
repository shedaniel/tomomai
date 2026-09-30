import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import type { AddedChange, ModifiedChange, FieldChange } from "./ingestion/persistence/analyze";
import { chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import { buildChangeDescription, resolveUpdateWebhook, sendDiscordWebhook } from "./notifications";

const background = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => background.push(task) }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://example.test" }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }, flushLogger: vi.fn(async () => {}) }));
// vitest loads .env.local, so every channel starts unset.
const WEBHOOK_VARIABLES = ["", "_JP", "_INTL", "_CN", "_MAIMAI", "_MAIMAI_JP", "_MAIMAI_INTL", "_CHUNITHM", "_CHUNITHM_JP", "_CHUNITHM_INTL"]
  .map(suffix => `DISCORD_UPDATE_WEBHOOK${suffix}`);
beforeEach(() => { for (const name of WEBHOOK_VARIABLES) vi.stubEnv(name, undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); background.length = 0; });

const stubFetch = () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

it("identifies CHUNITHM changes independently of the host's frontend game", async () => {
  vi.stubEnv("FRONTEND_GAME", "maimai");
  vi.stubEnv("DISCORD_UPDATE_WEBHOOK_CHUNITHM_JP", "https://example.test/webhook");
  const fetch = stubFetch();
  await sendDiscordWebhook("chunithm", "jp", [{ songKey: "chart", label: "Test ULTIMA", songName: "Test", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145 }], [], []);
  await Promise.all(background);
  expect(fetch.mock.calls[0][0]).toBe("https://example.test/webhook");
  const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(payload.username).toBe("ともチュウ");
  expect(payload.embeds[0].title).toContain("CHUNITHM");
});

describe("resolveUpdateWebhook", () => {
  it("prefers the game and region channel, then the game channel", () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_CHUNITHM", "https://example.test/chunithm");
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_CHUNITHM_INTL", "https://example.test/chunithm-intl");
    expect(resolveUpdateWebhook("chunithm", "intl")).toBe("https://example.test/chunithm-intl");
    expect(resolveUpdateWebhook("chunithm", "jp")).toBe("https://example.test/chunithm");
  });

  it("keeps the region and unscoped channels for maimai alone", () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_JP", "https://example.test/jp");
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK", "https://example.test/all");
    expect(resolveUpdateWebhook("maimai", "jp")).toBe("https://example.test/jp");
    expect(resolveUpdateWebhook("maimai", "intl")).toBe("https://example.test/all");
    expect(resolveUpdateWebhook("chunithm", "jp")).toBeUndefined();
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_MAIMAI", "https://example.test/maimai");
    expect(resolveUpdateWebhook("maimai", "jp")).toBe("https://example.test/maimai");
  });

  it("posts no CHUNITHM JP update to the maimai JP channel", async () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_JP", "https://example.test/jp");
    const fetch = stubFetch();
    await sendDiscordWebhook("chunithm", "jp", [{ songKey: "chart", label: "Test ULTIMA", songName: "Test", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145 }], [], []);
    await Promise.all(background);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("sendDiscordWebhook", () => {
  it("does not post charts whose only changes are internal", async () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_MAIMAI", "https://example.test/maimai");
    const fetch = stubFetch();
    await sendDiscordWebhook("maimai", "jp", [], [], [
      modifiedField("ECHO", "master", "metadata", undefined, { levelPreciseEstimated: true }),
      modifiedField("ECHO", "expert", "cover", "a.jpg", "b.jpg"),
    ]);
    await Promise.all(background);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts only the public fields of a chart that also changed internally", async () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_MAIMAI", "https://example.test/maimai");
    const fetch = stubFetch();
    await sendDiscordWebhook("maimai", "jp", [], [], [modifiedLevel("ECHO", "master", [
      { field: "genre", oldValue: "POPS & ANIME", newValue: "maimai" },
      { field: "metadata", oldValue: { source: { provider: "otoge-db", id: "1" } }, newValue: { source: { provider: "otoge-db", id: "2" } } },
    ])]);
    await Promise.all(background);
    const { description } = JSON.parse(String(fetch.mock.calls[0][1]?.body)).embeds[0];
    expect(description).toBe("**1 Genre Change**\n- ECHO DX: POPS & ANIME → maimai");
  });
});

function added(
  songName: string,
  difficulty: Difficulty,
  level: string,
  levelPrecise: number,
  type: SongType = "dx",
): AddedChange {
  return {
    songKey: `${songName}@${type}@${difficulty}`,
    label: songName,
    songName,
    difficulty: difficultyToCode(difficulty),
    chartType: chartTypeToCode(type),
    level,
    levelPrecise,
    artist: "artist",
  };
}

function modifiedLevel(
  songName: string,
  difficulty: Difficulty,
  fieldChanges: FieldChange[],
  type: SongType = "dx",
): ModifiedChange {
  return {
    songKey: `${songName}@${type}@${difficulty}`,
    label: songName,
    songName,
    difficulty: difficultyToCode(difficulty),
    chartType: chartTypeToCode(type),
    fieldChanges,
    dbId: "id",
  };
}

function modifiedField(
  songName: string,
  difficulty: Difficulty,
  field: FieldChange["field"],
  oldValue: any,
  newValue: any,
  type: SongType = "dx",
): ModifiedChange {
  return modifiedLevel(songName, difficulty, [{ field, oldValue, newValue }], type);
}

describe("buildChangeDescription", () => {
  it("uses CHUNITHM chart labels", () => {
    const description = buildChangeDescription("chunithm", [{ songKey: "chart", label: "Test ULTIMA", songName: "Test", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145 }], [], []);
    expect(description).toContain("- Test: ULT 14+ (14.5)");
    expect(description).not.toContain("STANDARD");
    expect(description).not.toContain("REMASTER");
  });
  it("sorts CHUNITHM difficulty codes for deleted charts and differing field changes", () => {
    const changes = [4, 0, 3].map(difficulty => ({ songKey: `chart-${difficulty}`, label: "Test", songName: "Test", artist: "Artist",
      chartType: 0, difficulty, level: "14+", levelPrecise: 145, dbId: String(difficulty), playRecordCount: 0 }));
    const description = buildChangeDescription("chunithm", [], changes, changes.map(change => ({
      ...change, fieldChanges: [{ field: "genre" as const, oldValue: "Old", newValue: change.difficulty === 0 ? "Basic" : "Other" }],
    })));
    expect(description).toContain("Test: BAS 14+ (14.5) / MAS 14+ (14.5) / ULT 14+ (14.5)");
    expect(description).toContain("- Test BAS: Old → Basic\n- Test MAS / ULT: Old → Other");
    expect(description).not.toContain("STANDARD");
    expect(changes.map(change => change.difficulty)).toEqual([4, 0, 3]);
  });
  it("groups added charts of one song onto a single difficulty-sorted line", () => {
    // Deliberately out of play order to prove sorting (BAS/ADV/EXP/MAS).
    const description = buildChangeDescription("maimai",
      [
        added("ECHO", "master", "13+", 137),
        added("ECHO", "basic", "4", 40),
        added("ECHO", "expert", "11", 112),
        added("ECHO", "advanced", "7+", 79),
      ],
      [],
      [],
    );

    expect(description).toContain("**4 Charts Added**");
    expect(description).toContain(
      "- ECHO DX: BAS 4 (4.0) / ADV 7+ (7.9) / EXP 11 (11.2) / MAS 13+ (13.7)",
    );
  });

  it("keeps maimai's REM and UTA abbreviations", () => {
    const description = buildChangeDescription("maimai", [added("ECHO", "remaster", "14", 140), added("ECHO", "utage", "13?", 130)], [], []);
    expect(description).toContain("- ECHO DX: REM 14 (14.0) / UTA 13? (13.0)");
  });

  it("keeps separate songs and chart types on their own lines, sorted by name", () => {
    const description = buildChangeDescription("maimai",
      [
        added("Sky Trails", "basic", "5", 50),
        added("ECHO", "basic", "4", 40),
        added("ECHO", "basic", "4", 40, "std"),
      ],
      [],
      [],
    );

    const lines = description.trim().split("\n");
    expect(lines).toEqual([
      "**3 Charts Added**",
      "- ECHO DX: BAS 4 (4.0)",
      "- ECHO STD: BAS 4 (4.0)",
      "- Sky Trails DX: BAS 5 (5.0)",
    ]);
  });

  it("renders precise levels and counts charts (not lines) in the header", () => {
    const description = buildChangeDescription("maimai",
      [
        added("Slow Glow", "basic", "3", 30),
        added("Slow Glow", "advanced", "7", 70),
      ],
      [],
      [],
    );

    expect(description).toContain("**2 Charts Added**");
    expect(description).toContain("- Slow Glow DX: BAS 3 (3.0) / ADV 7 (7.0)");
  });

  it("groups level changes per song with one segment per difficulty", () => {
    const description = buildChangeDescription("maimai",
      [],
      [],
      [
        modifiedLevel("ECHO", "expert", [
          { field: "level", oldValue: "11", newValue: "11+" },
          { field: "levelPrecise", oldValue: 112, newValue: 115 },
        ]),
        modifiedLevel("ECHO", "master", [
          { field: "levelPrecise", oldValue: 137, newValue: 138 },
        ]),
      ],
    );

    expect(description).toContain("**2 Level Changes**");
    expect(description).toContain(
      "- ECHO DX: EXP 11 (11.2) → 11+ (11.5) / MAS (13.7) → (13.8)",
    );
  });

  it("collapses an other-field change shared by every difficulty into one markerless line", () => {
    const description = buildChangeDescription("maimai",
      [],
      [],
      [
        modifiedField("ECHO", "master", "genre", "POPS & ANIME", "maimai"),
        modifiedField("ECHO", "expert", "genre", "POPS & ANIME", "maimai"),
      ],
    );

    // Header counts charts; body collapses to one line with no BAS/ADV markers.
    expect(description).toContain("**2 Genre Changes**");
    expect(description).toContain("- ECHO DX: POPS & ANIME → maimai");
    expect(description).not.toMatch(/ECHO DX (MAS|EXP)/);
  });

  it("sub-groups difficulties that share a change and lists the rest separately", () => {
    const description = buildChangeDescription("maimai",
      [],
      [],
      [
        modifiedField("ECHO", "expert", "genre", "POPS & ANIME", "niconico"),
        modifiedField("ECHO", "basic", "genre", "POPS & ANIME", "maimai"),
        modifiedField("ECHO", "advanced", "genre", "POPS & ANIME", "maimai"),
      ],
    );

    const lines = description.trim().split("\n");
    expect(lines).toEqual([
      "**3 Genre Changes**",
      "- ECHO DX BAS / ADV: POPS & ANIME → maimai",
      "- ECHO DX EXP: POPS & ANIME → niconico",
    ]);
  });

  it("never folds an other-field change across std and dx", () => {
    const description = buildChangeDescription("maimai",
      [],
      [],
      [
        modifiedField("ECHO", "master", "genre", "POPS & ANIME", "maimai", "std"),
        modifiedField("ECHO", "master", "genre", "POPS & ANIME", "maimai", "dx"),
      ],
    );

    const lines = description.trim().split("\n");
    expect(lines).toEqual([
      "**2 Genre Changes**",
      "- ECHO DX: POPS & ANIME → maimai",
      "- ECHO STD: POPS & ANIME → maimai",
    ]);
  });

  it("renders object changes as changed leaf paths", () => {
    const counts = { tap: 100, hold: 5, slide: 10, touch: 0, break: 4 };
    const description = buildChangeDescription("maimai", [], [], [
      modifiedField("ECHO", "master", "noteCounts", counts, { ...counts, tap: 101, break: 5 }),
      modifiedField("Sky", "master", "noteCounts", undefined, { tap: 1 }),
      modifiedField("Zeta", "master", "noteCounts", { tap: { head: 1 } }, { tap: { head: 2 } }),
    ]);
    expect(description.trim().split("\n")).toEqual([
      "**3 NoteCounts Changes**",
      "- ECHO DX: tap 100→101, break 4→5",
      "- Sky DX: tap none→1",
      "- Zeta DX: tap.head 1→2",
    ]);
    expect(description).not.toContain("[object Object]");
  });

  it("leaves internal fields out of the description", () => {
    const description = buildChangeDescription("chunithm", [], [], [{
      songKey: "chart", label: "Test ULTIMA", songName: "Test", chartType: 0, difficulty: 4, dbId: "1",
      fieldChanges: [{ field: "metadata", oldValue: { source: { provider: "otoge-db", id: "1" } }, newValue: undefined }],
    }]);
    expect(description.trim()).toBe("");
  });

  it("ignores cover-only differences passed through in modified entries' other fields", () => {
    const description = buildChangeDescription("maimai",
      [],
      [],
      [
        modifiedLevel("ECHO", "master", [
          { field: "cover", oldValue: "a.jpg", newValue: "b.jpg" },
        ]),
      ],
    );

    expect(description).not.toContain("Cover");
    expect(description.trim()).toBe("");
  });
});
