import { isDeepStrictEqual } from "node:util";
import type { parentSong, songs } from "@/lib/db/schema-pg";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";
import { matchUpload } from "../match-upload";
import { catalogChartKey, mergeCatalogChart } from "../normalize-charts";
import { CATALOG_INSTANCE_FIELDS, CATALOG_PARENT_FIELDS, type CatalogChart } from "../schema";

export const CATALOG_UPDATE_MODES = ["noop", "alter", "destructive"] as const;

/** noop previews, alter keeps charts that user data references, destructive deletes them too. */
export type CatalogUpdateMode = (typeof CATALOG_UPDATE_MODES)[number];

export function parseCatalogUpdateMode(value: string | null): CatalogUpdateMode {
  return CATALOG_UPDATE_MODES.find(mode => mode === value) ?? "noop";
}

export type CatalogInstance = { region: Region; gameVersion: number };

/** A stored chart instance with the row identities a write needs. */
export type StoredChart = { id: bigint; parentId: bigint; chart: CatalogChart };

export type StoredChartRow = typeof parentSong.$inferSelect & typeof songs.$inferSelect;

const COMPARED_FIELDS = [...CATALOG_PARENT_FIELDS, ...CATALOG_INSTANCE_FIELDS];

export type FieldChange = {
  field: (typeof COMPARED_FIELDS)[number];
  oldValue: unknown;
  newValue: unknown;
};

type ChangeRecord = {
  songKey: string;
  songName: string;
  difficulty: number;
  chartType: number;
};

export type AddedChange = ChangeRecord & {
  level: string;
  levelPrecise: number;
  artist: string;
};

export type ModifiedChange = ChangeRecord & {
  fieldChanges: FieldChange[];
  dbId: string;
};

export type DeletedChange = ChangeRecord & {
  level: string;
  levelPrecise: number;
  artist: string;
  dbId: string;
  playRecordCount: number;
};

export type ChangeAnalysis = {
  added: AddedChange[];
  modified: ModifiedChange[];
  deleted: DeletedChange[];
  unchanged: string[];
};

export type MergedChart = { stored: StoredChart; chart: CatalogChart; fieldChanges: FieldChange[] };

export type CatalogAnalysis = {
  /** Incoming charts that match no stored chart. */
  added: CatalogChart[];
  /** Stored charts with the incoming values merged in, changed or not. */
  merged: MergedChart[];
  /** Stored charts that no incoming chart matched. */
  removed: StoredChart[];
};

export function toStoredChart(row: StoredChartRow): StoredChart {
  return {
    id: row.id,
    parentId: row.parentId,
    chart: {
      game: row.game,
      songName: row.songName,
      chartType: row.type,
      difficulty: row.difficulty,
      artist: row.artist,
      cover: row.cover,
      level: row.level,
      levelPrecise: row.levelPrecise,
      genre: row.genre,
      addedVersion: row.addedVersion,
      bpm: row.bpm ?? undefined,
      noteDesigner: row.noteDesigner ?? undefined,
      noteCounts: row.tapCount === null ? undefined : {
        tap: row.tapCount,
        hold: row.holdCount!,
        slide: row.slideCount!,
        touch: row.touchCount!,
        break: row.breakCount!,
      },
      metadata: row.metadata ?? undefined,
    },
  };
}

export function toInstanceValues(game: CanonicalGameId, chart: CatalogChart, parentId: bigint, { region, gameVersion }: CatalogInstance) {
  return {
    game,
    parentId,
    region,
    gameVersion,
    level: chart.level,
    levelPrecise: chart.levelPrecise,
    addedVersion: chart.addedVersion,
    noteDesigner: chart.noteDesigner ?? null,
    metadata: chart.metadata ?? null,
    tapCount: chart.noteCounts?.tap ?? null,
    holdCount: chart.noteCounts?.hold ?? null,
    slideCount: chart.noteCounts?.slide ?? null,
    touchCount: chart.noteCounts?.touch ?? null,
    breakCount: chart.noteCounts?.break ?? null,
  } satisfies typeof songs.$inferInsert;
}

// jsonb drops undefined members and does not keep key order, so object values compare as stored JSON.
function jsonValue(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function compareFields(before: CatalogChart, after: CatalogChart): FieldChange[] {
  return COMPARED_FIELDS.flatMap(field => {
    const oldValue = before[field];
    const newValue = after[field];
    const same = typeof oldValue === "object" || typeof newValue === "object"
      ? isDeepStrictEqual(jsonValue(oldValue), jsonValue(newValue))
      : oldValue === newValue;
    return same ? [] : [{ field, oldValue, newValue }];
  });
}

/** Pairs incoming charts with stored ones, refusing an incoming chart that could be more than one stored chart. */
export function matchIncoming(stored: CatalogChart[], incoming: CatalogChart[]): Map<number, number> {
  const assignments = matchUpload(stored, incoming);
  const matched = new Set(assignments.values());
  incoming.forEach((chart, index) => {
    const key = catalogChartKey(chart);
    if (!assignments.has(index) && stored.some((existing, storedIndex) => !matched.has(storedIndex) && catalogChartKey(existing) === key)) {
      throw new Error(`Ambiguous catalog identity: ${key}`);
    }
  });
  return assignments;
}

function keepStoredParentFields(chart: CatalogChart, stored: CatalogChart): CatalogChart {
  return { ...chart, ...Object.fromEntries(CATALOG_PARENT_FIELDS.map(field => [field, stored[field]])) };
}

/** A parent whose preferred instance lies elsewhere keeps its stored attributes, since only that instance may change them. */
export function analyzeChanges(stored: StoredChart[], incoming: CatalogChart[], nonPreferredParents: ReadonlySet<bigint>): CatalogAnalysis {
  const assignments = matchIncoming(stored.map(entry => entry.chart), incoming);
  const added: CatalogChart[] = [];
  const merged: MergedChart[] = [];
  incoming.forEach((chart, index) => {
    const storedIndex = assignments.get(index);
    if (storedIndex === undefined) {
      added.push(chart);
      return;
    }
    const existing = stored[storedIndex];
    const result = mergeCatalogChart(existing.chart, chart);
    const kept = nonPreferredParents.has(existing.parentId) ? keepStoredParentFields(result, existing.chart) : result;
    merged.push({ stored: existing, chart: kept, fieldChanges: compareFields(existing.chart, kept) });
  });
  const matched = new Set(assignments.values());
  return { added, merged, removed: stored.filter((_, index) => !matched.has(index)) };
}

function changeRecord(chart: CatalogChart): ChangeRecord {
  return { songKey: catalogChartKey(chart), songName: chart.songName, difficulty: chart.difficulty, chartType: chart.chartType };
}

export function describeChanges(analysis: CatalogAnalysis, referenceCounts: ReadonlyMap<bigint, number>): ChangeAnalysis {
  return {
    added: analysis.added.map(chart => ({
      ...changeRecord(chart), level: chart.level, levelPrecise: chart.levelPrecise, artist: chart.artist,
    })),
    modified: analysis.merged.filter(entry => entry.fieldChanges.length > 0).map(({ stored, chart, fieldChanges }) => ({
      ...changeRecord(chart), fieldChanges, dbId: String(stored.id),
    })),
    deleted: analysis.removed.map(({ id, chart }) => ({
      ...changeRecord(chart), level: chart.level, levelPrecise: chart.levelPrecise, artist: chart.artist,
      dbId: String(id), playRecordCount: referenceCounts.get(id) ?? 0,
    })),
    unchanged: analysis.merged.filter(entry => entry.fieldChanges.length === 0).map(entry => catalogChartKey(entry.chart)),
  };
}

/** Which removed charts a mode deletes, and which it keeps because user data references them. */
export function planDeletions(deleted: DeletedChange[], mode: CatalogUpdateMode): { apply: DeletedChange[]; skip: DeletedChange[] } {
  if (mode === "destructive") return { apply: deleted, skip: [] };
  return {
    apply: mode === "alter" ? deleted.filter(change => change.playRecordCount === 0) : [],
    skip: deleted.filter(change => change.playRecordCount > 0),
  };
}
