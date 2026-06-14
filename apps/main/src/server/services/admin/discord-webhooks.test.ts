import { describe, it, expect } from "vitest";
import { Difficulty, SongType } from "@/lib/types";
import type { AddedChange, ModifiedChange, FieldChange } from "@/app/api/admin/upload/route";
import { buildChangeDescription } from "./discord-webhooks";

function added(
  songName: string,
  difficulty: Difficulty,
  level: string,
  levelPrecise: number | undefined,
  type: SongType = "dx",
): AddedChange {
  return {
    songKey: `${songName}@${type}@${difficulty}`,
    songName,
    difficulty,
    type,
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
    songName,
    difficulty,
    type,
    fieldChanges,
    dbId: "id",
  };
}

function modifiedField(
  songName: string,
  difficulty: Difficulty,
  field: string,
  oldValue: any,
  newValue: any,
  type: SongType = "dx",
): ModifiedChange {
  return modifiedLevel(songName, difficulty, [{ field, oldValue, newValue }], type);
}

describe("buildChangeDescription", () => {
  it("groups added charts of one song onto a single difficulty-sorted line", () => {
    // Deliberately out of play order to prove sorting (BAS/ADV/EXP/MAS).
    const description = buildChangeDescription(
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

  it("keeps separate songs and chart types on their own lines, sorted by name", () => {
    const description = buildChangeDescription(
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

  it("renders unknown precise levels and counts charts (not lines) in the header", () => {
    const description = buildChangeDescription(
      [
        added("Slow Glow", "basic", "3", undefined),
        added("Slow Glow", "advanced", "7", 70),
      ],
      [],
      [],
    );

    expect(description).toContain("**2 Charts Added**");
    expect(description).toContain("- Slow Glow DX: BAS 3 (unknown) / ADV 7 (7.0)");
  });

  it("groups level changes per song with one segment per difficulty", () => {
    const description = buildChangeDescription(
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
    const description = buildChangeDescription(
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
    const description = buildChangeDescription(
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
    const description = buildChangeDescription(
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

  it("ignores cover-only differences passed through in modified entries' other fields", () => {
    const description = buildChangeDescription(
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
