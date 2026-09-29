import { describe, expect, it } from "vitest";
import { CANONICAL_GAME_IDS, REGIONS } from "./ids";
import { getGame } from "./registry";
import { getSupportedRegions } from "./regions";
import { versionReleaseInstant } from "./version-table";
import { getVersion } from "./versions";

describe("game version tables", () => {
  it.each(CANONICAL_GAME_IDS)("%s has unique ids and release dates only for its sites, in id order", game => {
    const rows = [...getGame(game).versions.rows].sort((a, b) => a.id - b.id);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
    const supported: readonly string[] = getSupportedRegions(game);
    for (const region of REGIONS) {
      const releases = rows.flatMap(row => row.releaseDates[region] ?? []).map(date => versionReleaseInstant(date).getTime());
      if (!supported.includes(region)) expect(releases, region).toEqual([]);
      expect(releases.every(Number.isFinite), region).toBe(true);
      expect(releases, region).toEqual([...releases].sort((a, b) => a - b));
    }
  });

  it("labels versions that some regions never released", () => {
    expect(getVersion("maimai", 14)?.name).toBe("maimai DX MAGiCAL");
    expect(getVersion("maimai", -9)?.name).toBe("maimai ORANGE");
    expect(getVersion("chunithm", 9)?.shortName).toBe("Mate");
    expect(getVersion("maimai", 999)).toBeNull();
  });
});
