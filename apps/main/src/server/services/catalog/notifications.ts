import { isDeepStrictEqual } from "node:util";
import { regionDisplayName } from "@/lib/discord/i18n";
import { DEFAULT_FRONTEND_GAME, type Region, type CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import { getLogger } from "@/lib/request-logger";
import { postDiscordEmbed } from "@/server/services/discord/webhook";
import type { AddedChange, DeletedChange, FieldChange, ModifiedChange } from "./ingestion/persistence/analyze";
import { keyOf } from "@/lib/games/codes";
import { getGameChartType } from "@/lib/games/presentation";

/** The fields the public update channel reports. Covers and metadata are internal. */
const PUBLIC_FIELDS: ReadonlySet<FieldChange["field"]> = new Set([
  "artist", "level", "levelPrecise", "genre", "addedVersion", "bpm", "noteDesigner", "noteCounts",
]);

function formatPrecise(value: number): string {
  return (value / 10).toFixed(1);
}

function difficultyShort(game: CanonicalGameId, difficulty: number): string {
  return keyOf(game, "difficulty", difficulty).slice(0, 3).toUpperCase();
}

/** A song by name and chart type, leaving out a chart type the game never shows. */
function songLabel(game: CanonicalGameId, songName: string, chartType: number): string {
  const type = getGameChartType(game, chartType);
  return type.implicit ? songName : `${songName} ${type.label}`;
}

// Collapse every chart that shares a song (name + type) onto one compact line,
// e.g. "- ECHO DX: BAS 4 (4.0) / ADV 7+ (7.9) / EXP 11 (11.2)", with the
// difficulties listed in play order. `formatChart` renders one chart's segment.
function groupChartLines<T extends { songName: string; chartType: number; difficulty: number }>(
  game: CanonicalGameId,
  charts: T[],
  formatChart: (chart: T) => string,
): string[] {
  const groups = new Map<string, T[]>();
  for (const chart of charts) {
    const key = `${chart.songName} ${chart.chartType}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(chart);
    else groups.set(key, [chart]);
  }
  return [...groups.values()]
    .sort((a, b) => a[0].songName.localeCompare(b[0].songName) || keyOf(game, "chartType", a[0].chartType).localeCompare(keyOf(game, "chartType", b[0].chartType)))
    .map(bucket => {
      const segments = bucket
        .toSorted((a, b) => a.difficulty - b.difficulty)
        .map(formatChart)
        .join(" / ");
      return `- ${songLabel(game, bucket[0].songName, bucket[0].chartType)}: ${segments}`;
    });
}

type OtherEntry = { songName: string; chartType: number; difficulty: number; oldValue: unknown; newValue: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatLeaf(value: unknown): string {
  return value === undefined ? "none" : JSON.stringify(value);
}

/** The changed leaves of an object field as `path old→new`, reading an absent side as an empty object. */
function leafChanges(path: string, before: unknown, after: unknown): string[] {
  const walkable = (value: unknown) => isRecord(value) || value === undefined || value === null;
  if ((isRecord(before) || isRecord(after)) && walkable(before) && walkable(after)) {
    const left = isRecord(before) ? before : {};
    const right = isRecord(after) ? after : {};
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap(key => leafChanges(path ? `${path}.${key}` : key, left[key], right[key]));
  }
  return isDeepStrictEqual(before, after) ? [] : [`${path} ${formatLeaf(before)}→${formatLeaf(after)}`];
}

// Two charts whose changes render the same string are folded together.
function formatFieldDiff(oldValue: unknown, newValue: unknown): string {
  if (isRecord(oldValue) || isRecord(newValue)) return leafChanges("", oldValue, newValue).join(", ");
  return `${oldValue} → ${newValue}`;
}

// Fold an "other field" bucket by song (name + type, never across chart types).
// When every changed difficulty of a song shares one change, emit a single
// markerless line; when they diverge, emit one line per distinct change listing
// the difficulties it covers in play order.
function groupOtherFieldLines(game: CanonicalGameId, entries: OtherEntry[]): string[] {
  const songGroups = new Map<string, OtherEntry[]>();
  for (const entry of entries) {
    const key = `${entry.songName} ${entry.chartType}`;
    const bucket = songGroups.get(key);
    if (bucket) bucket.push(entry);
    else songGroups.set(key, [entry]);
  }
  return [...songGroups.values()]
    .sort((a, b) => a[0].songName.localeCompare(b[0].songName) || keyOf(game, "chartType", a[0].chartType).localeCompare(keyOf(game, "chartType", b[0].chartType)))
    .flatMap(group => {
      const label = songLabel(game, group[0].songName, group[0].chartType);
      const byDiff = new Map<string, OtherEntry[]>();
      for (const entry of group) {
        const diff = formatFieldDiff(entry.oldValue, entry.newValue);
        const bucket = byDiff.get(diff);
        if (bucket) bucket.push(entry);
        else byDiff.set(diff, [entry]);
      }
      // All present difficulties share the same change — drop the markers.
      if (byDiff.size === 1) {
        const [diff] = byDiff.keys();
        return [`- ${label}: ${diff}`];
      }
      return [...byDiff.entries()]
        .sort((a, b) => Math.min(...a[1].map(entry => entry.difficulty)) - Math.min(...b[1].map(entry => entry.difficulty)))
        .map(([diff, es]) => {
          const diffs = es.toSorted((a, b) => a.difficulty - b.difficulty)
            .map(e => difficultyShort(game, e.difficulty))
            .join(" / ");
          return `- ${label} ${diffs}: ${diff}`;
        });
    });
}

const LEVEL_TRUNCATE_LIMIT = 32;
const OTHER_TRUNCATE_LIMIT = 8;

function truncateLines(lines: string[], limit: number): string {
  if (lines.length <= limit) return lines.join("\n");
  const extra = lines.length - limit;
  return lines.slice(0, limit).join("\n") + `\n... and ${extra} more changes`;
}

// Build the public embed description for a song-data update. Charts are grouped by song so
// every difficulty for one song lands on a single compact line. Non-public fields are left out.
export function buildChangeDescription(game: CanonicalGameId, added: AddedChange[], deleted: DeletedChange[], modified: ModifiedChange[]): string {
  let description = "";

  const formatLevelSegment = (chart: { difficulty: number; level: string; levelPrecise: number }) =>
    `${difficultyShort(game, chart.difficulty)} ${chart.level} (${chart.levelPrecise ? formatPrecise(chart.levelPrecise) : 'unknown'})`;

  if (added.length > 0) {
    description += `**${added.length} Chart${added.length > 1 ? 's' : ''} Added**\n`;
    const lines = groupChartLines(game, added, formatLevelSegment);
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  if (deleted.length > 0) {
    description += `**${deleted.length} Chart${deleted.length > 1 ? 's' : ''} Deleted**\n`;
    const lines = groupChartLines(game, deleted, formatLevelSegment);
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  if (modified.length > 0) {
    type LevelEntry = {
      songName: string;
      chartType: number;
      difficulty: number;
      oldValue?: any;
      newValue?: any;
      levelPreciseOld?: any;
      levelPreciseNew?: any;
    };
    const levelBucket: LevelEntry[] = [];
    const otherBuckets: Record<string, OtherEntry[]> = {};

    for (const song of modified) {
      const levelChange = song.fieldChanges.find(c => c.field === "level");
      const levelPreciseChange = song.fieldChanges.find(c => c.field === "levelPrecise");

      if (levelChange || levelPreciseChange) {
        levelBucket.push({
          songName: song.songName,
          chartType: song.chartType,
          difficulty: song.difficulty,
          oldValue: levelChange?.oldValue,
          newValue: levelChange?.newValue,
          levelPreciseOld: levelPreciseChange?.oldValue,
          levelPreciseNew: levelPreciseChange?.newValue,
        });
      }

      for (const change of song.fieldChanges) {
        if (change.field === "level" || change.field === "levelPrecise" || !PUBLIC_FIELDS.has(change.field)) continue;
        if (!otherBuckets[change.field]) otherBuckets[change.field] = [];
        otherBuckets[change.field].push({
          songName: song.songName,
          chartType: song.chartType,
          difficulty: song.difficulty,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }
    }

    // Level section first, grouped by song with one segment per difficulty
    if (levelBucket.length > 0) {
      description += `**${levelBucket.length} Level Change${levelBucket.length > 1 ? 's' : ''}**\n`;
      const lines = groupChartLines(game, levelBucket, change => {
        const diff = difficultyShort(game, change.difficulty);
        const hasLevel = change.oldValue !== undefined || change.newValue !== undefined;
        const hasPrecise = change.levelPreciseOld !== undefined || change.levelPreciseNew !== undefined;
        const preciseOld = change.levelPreciseOld !== undefined ? formatPrecise(change.levelPreciseOld) : "?";
        const preciseNew = change.levelPreciseNew !== undefined ? formatPrecise(change.levelPreciseNew) : "?";
        if (hasLevel && hasPrecise) {
          return `${diff} ${change.oldValue ?? "?"} (${preciseOld}) → ${change.newValue ?? "?"} (${preciseNew})`;
        } else if (hasLevel) {
          return `${diff} ${change.oldValue ?? "?"} → ${change.newValue ?? "?"}`;
        }
        return `${diff} (${preciseOld}) → (${preciseNew})`;
      });
      description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
    }

    for (const field of Object.keys(otherBuckets).sort()) {
      const entries = otherBuckets[field];
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      description += `**${entries.length} ${fieldLabel} Change${entries.length > 1 ? 's' : ''}**\n`;
      const lines = groupOtherFieldLines(game, entries);
      description += truncateLines(lines, OTHER_TRUNCATE_LIMIT) + "\n\n";
    }
  }

  return description;
}

/**
 * The public update channel for a game and region: `DISCORD_UPDATE_WEBHOOK_<GAME>_<REGION>`, then
 * `DISCORD_UPDATE_WEBHOOK_<GAME>`. The region-only and unscoped variables predate per-game channels,
 * so only the original game still reads them.
 */
export function resolveUpdateWebhook(game: CanonicalGameId, region: Region): string | undefined {
  const scoped = process.env[`DISCORD_UPDATE_WEBHOOK_${game.toUpperCase()}_${region.toUpperCase()}`]
    ?? process.env[`DISCORD_UPDATE_WEBHOOK_${game.toUpperCase()}`];
  if (scoped || game !== DEFAULT_FRONTEND_GAME) return scoped;
  return process.env[`DISCORD_UPDATE_WEBHOOK_${region.toUpperCase()}`] ?? process.env.DISCORD_UPDATE_WEBHOOK;
}

export async function sendDiscordWebhook(
  game: CanonicalGameId,
  region: Region,
  added: AddedChange[],
  deleted: DeletedChange[],
  modified: ModifiedChange[],
) {
  const webhookUrl = resolveUpdateWebhook(game, region);
  if (!webhookUrl) {
    getLogger().debug({ game, region }, "No update webhook configured, skipping webhook notification");
    return;
  }

  const filteredModified = modified.filter(m => m.fieldChanges.some(c => PUBLIC_FIELDS.has(c.field)));

  if (added.length === 0 && deleted.length === 0 && filteredModified.length === 0) {
    getLogger().debug({ game, region }, "No changes detected, skipping webhook notification");
    return;
  }

  const now = new Date();

  const jstDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [month, day, year] = jstDate.split('/');
  const dateStr = `${year}/${month}/${day}`;

  const description = buildChangeDescription(game, added, deleted, filteredModified);

  const hasLevelChanges = filteredModified.some(m =>
    m.fieldChanges.some(c => c.field === "level" || c.field === "levelPrecise")
  );

  let color: number;
  if (deleted.length > 0) {
    color = 0xFF0000; // Red - any deleted
  } else if (added.length > 0) {
    color = 0x00FF00; // Green - songs added, no deleted
  } else if (hasLevelChanges) {
    color = 0xFFFF00; // Yellow - only level modifications
  } else {
    color = 0x808080; // Gray - no changes or non-level modifications
  }

  postDiscordEmbed(webhookUrl, { game, region }, {
    title: `${getGame(game).brand.displayName} song data update - ${dateStr} - ${regionDisplayName(region)}`,
    description: description.trim() || "No changes detected",
    color,
    timestamp: now.toISOString(),
  });
}
