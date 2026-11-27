import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import type { Region } from "@/lib/games/ids";
import { difficultyToCode } from "@/lib/games/maimai/codes";
import { MAIMAI_PLATE_DIFFICULTIES, MAIMAI_PLATE_TYPES, meetsMaimaiPlate, type MaimaiPlateType } from "@/lib/games/maimai/plates";
import { maimaiVersionTable } from "@/lib/games/maimai/versions";
import type { GamePlayerScore } from "@/lib/games/player-view";

const PLATE_DIFFICULTY_CODES = MAIMAI_PLATE_DIFFICULTIES.map(difficulty => difficultyToCode(difficulty));

/** Plate charts per added version in a region's catalog, played or not. */
const loadPlateTotals = (region: Region, gameVersion: number) => unstable_cache(
  async () => db
    .select({ addedVersion: songs.addedVersion, charts: sql<number>`count(*)`.mapWith(Number) })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(songs.game, "maimai"),
      eq(songs.region, region),
      eq(songs.gameVersion, gameVersion),
      inArray(parentSong.difficulty, PLATE_DIFFICULTY_CODES),
    ))
    .groupBy(songs.addedVersion),
  ["net-plate-totals", region, String(gameVersion)],
  { revalidate: 3600 },
)();

export type VersionPlateProgress = {
  versionId: number;
  versionName: string;
  plate: MaimaiPlateType;
  done: number;
  total: number;
  earned: boolean;
};

/** Every version plate of the catalog, newest version first, with how many charts the scores already clear. */
export async function computeVersionPlates(scores: readonly GamePlayerScore[], region: Region, gameVersion: number): Promise<VersionPlateProgress[]> {
  const totals = await loadPlateTotals(region, gameVersion);
  const done = new Map<number, Record<MaimaiPlateType, number>>();
  for (const score of scores) {
    if (!PLATE_DIFFICULTY_CODES.includes(score.difficultyCode)) continue;
    let counts = done.get(score.addedVersion);
    if (!counts) done.set(score.addedVersion, counts = { kiwami: 0, shou: 0, shin: 0, maimai: 0 });
    for (const plate of MAIMAI_PLATE_TYPES) if (meetsMaimaiPlate(plate, score)) counts[plate]++;
  }

  return totals
    .filter(row => row.charts > 0)
    .sort((a, b) => b.addedVersion - a.addedVersion)
    .flatMap(({ addedVersion, charts }) => {
      const versionName = maimaiVersionTable.get(addedVersion)?.shortName ?? String(addedVersion);
      return MAIMAI_PLATE_TYPES.map(plate => {
        const cleared = Math.min(done.get(addedVersion)?.[plate] ?? 0, charts);
        return { versionId: addedVersion, versionName, plate, done: cleared, total: charts, earned: cleared === charts };
      });
    });
}

const PLATE_PRESTIGE: Readonly<Record<MaimaiPlateType, number>> = { maimai: 3, shin: 2, shou: 1, kiwami: 0 };

/** The plate a player would most likely wear: the hardest earned one, newest version on ties. */
export function pickShowcasePlate(plates: readonly VersionPlateProgress[]): VersionPlateProgress | null {
  let best: VersionPlateProgress | null = null;
  for (const plate of plates) {
    if (!plate.earned) continue;
    if (!best || PLATE_PRESTIGE[plate.plate] > PLATE_PRESTIGE[best.plate]
      || (PLATE_PRESTIGE[plate.plate] === PLATE_PRESTIGE[best.plate] && plate.versionId > best.versionId)) best = plate;
  }
  return best;
}
