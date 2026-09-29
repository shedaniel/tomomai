import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PARENT_PUBLIC_ID_LENGTH } from "@/lib/catalog/song-instance-id";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { instancePreference } from "@/lib/games/regions";
import type { CanonicalGameId } from "@/lib/games/types";
import type { CatalogTransaction } from "../lock";
import { catalogChartKey } from "../normalize-charts";
import { resolveParents, type ParentState, type SongToParent } from "../resolve-parent";
import { CATALOG_PARENT_FIELDS, type CatalogChart } from "../schema";
import type { CatalogInstance } from "./analyze";

const BATCH_SIZE = 1000;

export type WriteRow = { chart: CatalogChart; parentId: bigint };

/** Parents that have an instance preferred over this one. */
export async function findNonPreferredParents(tx: CatalogTransaction, parentIds: bigint[], instance: CatalogInstance): Promise<Set<bigint>> {
  if (parentIds.length === 0) return new Set();
  const siblings = await tx
    .select({ parentId: songs.parentId, region: songs.region, gameVersion: songs.gameVersion })
    .from(songs)
    .where(inArray(songs.parentId, [...new Set(parentIds)]));
  const preference = instancePreference(instance);
  return new Set(siblings.filter(sibling => instancePreference(sibling) > preference).map(sibling => sibling.parentId));
}

/**
 * Finds the parent of each new chart, reusing a stored parent when the chart is another instance of it and
 * inserting new parents otherwise. Returns the parent ids in the order of `charts`.
 */
export async function resolveParentsForAddedCharts(
  tx: CatalogTransaction,
  game: CanonicalGameId,
  charts: CatalogChart[],
  instance: CatalogInstance,
): Promise<{ parentIds: bigint[]; newParents: number }> {
  if (charts.length === 0) return { parentIds: [], newParents: 0 };

  const names = [...new Set(charts.map(chart => chart.songName))];
  const candidateParents = await tx
    .select()
    .from(parentSong)
    .where(and(eq(parentSong.game, game), inArray(parentSong.songName, names)));

  const candidateIds = candidateParents.map(parent => parent.id);
  const candidateChildren = candidateIds.length > 0
    ? await tx
      .select({ parentId: songs.parentId, addedVersion: songs.addedVersion, region: songs.region, gameVersion: songs.gameVersion })
      .from(songs)
      .where(inArray(songs.parentId, candidateIds))
    : [];

  const childrenByParent = new Map<bigint, typeof candidateChildren>();
  for (const child of candidateChildren) {
    const list = childrenByParent.get(child.parentId) ?? [];
    list.push(child);
    childrenByParent.set(child.parentId, list);
  }

  const existingStates: ParentState[] = candidateParents.map(parent => {
    const children = childrenByParent.get(parent.id) ?? [];
    return {
      id: parent.id,
      game,
      songName: parent.songName,
      chartType: parent.type,
      difficulty: parent.difficulty,
      disambiguator: parent.disambiguator,
      artist: parent.artist,
      genre: parent.genre,
      cover: parent.cover,
      bpm: parent.bpm,
      childAddedVersions: new Set(children.map(child => child.addedVersion)),
      childRegionVersions: new Set(children.map(child => `${child.region}:${child.gameVersion}`)),
    };
  });

  // resolveParents keys its assignments by song id. New charts have none, so their index stands in for it.
  const songsToParent: SongToParent[] = charts.map((chart, index) => ({
    id: BigInt(index),
    game,
    songName: chart.songName,
    chartType: chart.chartType,
    difficulty: chart.difficulty,
    artist: chart.artist,
    genre: chart.genre,
    cover: chart.cover,
    bpm: chart.bpm ?? null,
    addedVersion: chart.addedVersion,
    region: instance.region,
    gameVersion: instance.gameVersion,
  }));

  const { assignments, newParents } = resolveParents(songsToParent, existingStates);

  for (let start = 0; start < newParents.length; start += BATCH_SIZE) {
    const batch = newParents.slice(start, start + BATCH_SIZE);
    const inserted = await tx
      .insert(parentSong)
      .values(batch.map(parent => ({
        game,
        publicId: nanoid(PARENT_PUBLIC_ID_LENGTH),
        songName: parent.songName,
        artist: parent.artist,
        genre: parent.genre,
        cover: parent.cover,
        bpm: parent.bpm,
        type: parent.chartType,
        difficulty: parent.difficulty,
        disambiguator: parent.disambiguator,
      })))
      .returning({ id: parentSong.id, songName: parentSong.songName, type: parentSong.type, difficulty: parentSong.difficulty, disambiguator: parentSong.disambiguator });
    for (const parent of batch) {
      const saved = inserted.find(row => row.songName === parent.songName && row.type === parent.chartType
        && row.difficulty === parent.difficulty && row.disambiguator === parent.disambiguator);
      if (!saved) throw new Error("Inserted parent missing from returned rows");
      parent.id = saved.id;
    }
  }

  const parentIds = charts.map((chart, index) => {
    const parentId = assignments.get(BigInt(index))?.id;
    if (parentId === undefined || parentId === null) throw new Error(`Parent resolution failed for ${catalogChartKey(chart)}`);
    return parentId;
  });
  return { parentIds, newParents: newParents.length };
}

/**
 * Copies the chart-stable attributes of the written charts onto their parents, for the parents whose
 * preferred instance is this one. Parent attributes then follow the latest instance, in the preferred region.
 */
export async function updateParentAttributes(tx: CatalogTransaction, rows: WriteRow[], instance: CatalogInstance): Promise<number> {
  const chartByParent = new Map<bigint, CatalogChart>();
  for (const row of rows) chartByParent.set(row.parentId, row.chart);
  if (chartByParent.size === 0) return 0;

  const parentIds = [...chartByParent.keys()];
  const [parents, children] = await Promise.all([
    tx.select().from(parentSong).where(inArray(parentSong.id, parentIds)),
    tx.select({ parentId: songs.parentId, region: songs.region, gameVersion: songs.gameVersion })
      .from(songs)
      .where(inArray(songs.parentId, parentIds)),
  ]);

  const preference = instancePreference(instance);
  const bestByParent = new Map<bigint, number>();
  for (const child of children) {
    bestByParent.set(child.parentId, Math.max(bestByParent.get(child.parentId) ?? -Infinity, instancePreference(child)));
  }

  let updated = 0;
  for (const parent of parents) {
    const chart = chartByParent.get(parent.id);
    if (!chart || preference < (bestByParent.get(parent.id) ?? preference)) continue;

    const next = { artist: chart.artist, cover: chart.cover, genre: chart.genre, bpm: chart.bpm ?? parent.bpm } satisfies Record<(typeof CATALOG_PARENT_FIELDS)[number], unknown>;
    if (CATALOG_PARENT_FIELDS.some(field => next[field] !== parent[field])) {
      await tx.update(parentSong).set(next).where(eq(parentSong.id, parent.id));
      updated++;
    }
  }
  return updated;
}
