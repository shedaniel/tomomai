import { after } from "next/server";
import { resolveBaseUrl } from "@/lib/base-url";
import { logger, flushLogger } from "@/lib/logger";
import type { AddedChange, DeletedChange, ModifiedChange } from "@/app/api/admin/upload/route";
import { Difficulty, Region, SongType } from "@/lib/types";
import { DIFFICULTY_ENUM } from "@/lib/db/types";

// Discord rejects an embed whose description exceeds 4096 chars with a 400.
// Cut at a line boundary and mark the truncation so the message still posts.
const DISCORD_DESC_LIMIT = 4096;
function truncateForDiscord(description: string): string {
  if (description.length <= DISCORD_DESC_LIMIT) return description;
  const marker = "\n… (truncated)";
  const budget = DISCORD_DESC_LIMIT - marker.length;
  const cut = description.lastIndexOf("\n", budget);
  return description.slice(0, cut > budget * 0.5 ? cut : budget).trimEnd() + marker;
}

// Vercel freezes the function as soon as the response is sent, killing any
// in-flight fetch that wasn't registered with after(). Run webhook delivery
// here so it survives the freeze, and flush logs afterwards so the outcome is
// actually observable (a bare fire-and-forget loses both the request and its
// logs). Falls back to best-effort when called outside a request scope.
function deliverInBackground(work: () => Promise<void>) {
  const task = (async () => {
    try {
      await work();
    } catch (error) {
      logger.error({ err: error }, "Discord delivery threw");
    } finally {
      await flushLogger().catch(() => { });
    }
  })();
  try {
    after(task);
  } catch {
    void task; // outside a request scope (scripts/tests) — best effort
  }
}

function formatPrecise(value: number): string {
  return (value / 10).toFixed(1);
}

// Play order (BAS / ADV / EXP / MAS / ReMAS / 宴) derived from the canonical
// difficulty enum, so grouped charts stay sorted if that list ever changes.
const DIFFICULTY_ORDER: Record<string, number> =
  Object.fromEntries(DIFFICULTY_ENUM.map((difficulty, index) => [difficulty, index]));

function difficultyShort(difficulty: string): string {
  return difficulty.slice(0, 3).toUpperCase();
}

// Collapse every chart that shares a song (name + type) onto one compact line,
// e.g. "- ECHO DX: BAS 4 (4.0) / ADV 7+ (7.9) / EXP 11 (11.2)", with the
// difficulties listed in play order. `formatChart` renders one chart's segment.
function groupChartLines<T extends { songName: string; type: SongType; difficulty: Difficulty }>(
  charts: T[],
  formatChart: (chart: T) => string,
): string[] {
  const groups = new Map<string, T[]>();
  for (const chart of charts) {
    const key = `${chart.songName} ${chart.type}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(chart);
    else groups.set(key, [chart]);
  }
  return [...groups.values()]
    .sort((a, b) => a[0].songName.localeCompare(b[0].songName) || a[0].type.localeCompare(b[0].type))
    .map(bucket => {
      const segments = bucket
        .toSorted((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99))
        .map(formatChart)
        .join(" / ");
      return `- ${bucket[0].songName} ${bucket[0].type.toUpperCase()}: ${segments}`;
    });
}

type OtherEntry = { songName: string; type: SongType; difficulty: Difficulty; oldValue: any; newValue: any };

// Render one "other field" change (genre, version, …) as the text after the
// song label. Two charts whose changes produce the same string are treated as
// identical and folded together.
function formatFieldDiff(oldValue: any, newValue: any): string {
  const oldObj = oldValue && typeof oldValue === "object" ? oldValue as Record<string, unknown> : null;
  const newObj = newValue && typeof newValue === "object" ? newValue as Record<string, unknown> : null;
  if (oldObj && newObj) {
    return Object.keys({ ...oldObj, ...newObj })
      .filter(k => oldObj[k] !== newObj[k])
      .map(k => `${k} ${oldObj[k]}→${newObj[k]}`)
      .join(", ");
  } else if (!oldObj && newObj) {
    return `(new) ${Object.entries(newObj).map(([k, v]) => `${k}:${v}`).join(" ")}`;
  } else if (oldObj && !newObj) {
    return `(removed) ${Object.entries(oldObj).map(([k, v]) => `${k}:${v}`).join(" ")}`;
  }
  return `${oldValue} → ${newValue}`;
}

// Fold an "other field" bucket by song (name + type, never across std/dx).
// When every changed difficulty of a song shares one change, emit a single
// markerless line; when they diverge, emit one line per distinct change listing
// the difficulties it covers in play order.
function groupOtherFieldLines(entries: OtherEntry[]): string[] {
  const songGroups = new Map<string, OtherEntry[]>();
  for (const entry of entries) {
    const key = `${entry.songName} ${entry.type}`;
    const bucket = songGroups.get(key);
    if (bucket) bucket.push(entry);
    else songGroups.set(key, [entry]);
  }
  const difficultyRank = (e: OtherEntry) => DIFFICULTY_ORDER[e.difficulty] ?? 99;
  return [...songGroups.values()]
    .sort((a, b) => a[0].songName.localeCompare(b[0].songName) || a[0].type.localeCompare(b[0].type))
    .flatMap(group => {
      const label = `${group[0].songName} ${group[0].type.toUpperCase()}`;
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
        .sort((a, b) => Math.min(...a[1].map(difficultyRank)) - Math.min(...b[1].map(difficultyRank)))
        .map(([diff, es]) => {
          const diffs = es.toSorted((a, b) => difficultyRank(a) - difficultyRank(b))
            .map(e => difficultyShort(e.difficulty))
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

// Build the embed description body for a song-data update. `modified` must
// already have cover-only entries filtered out. Charts are grouped by song so
// every difficulty for one song lands on a single compact line.
export function buildChangeDescription(
  added: AddedChange[],
  deleted: DeletedChange[],
  modified: ModifiedChange[],
): string {
  let description = "";

  const formatLevelSegment = (chart: { difficulty: Difficulty; level: string; levelPrecise: number | undefined }) =>
    `${difficultyShort(chart.difficulty)} ${chart.level} (${chart.levelPrecise ? formatPrecise(chart.levelPrecise) : 'unknown'})`;

  // Added charts
  if (added.length > 0) {
    description += `**${added.length} Chart${added.length > 1 ? 's' : ''} Added**\n`;
    const lines = groupChartLines(added, formatLevelSegment);
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  // Deleted charts
  if (deleted.length > 0) {
    description += `**${deleted.length} Chart${deleted.length > 1 ? 's' : ''} Deleted**\n`;
    const lines = groupChartLines(deleted, formatLevelSegment);
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  // Modified charts grouped by field
  if (modified.length > 0) {
    type LevelEntry = {
      songName: string;
      type: SongType;
      difficulty: Difficulty;
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
          type: song.type,
          difficulty: song.difficulty,
          oldValue: levelChange?.oldValue,
          newValue: levelChange?.newValue,
          levelPreciseOld: levelPreciseChange?.oldValue,
          levelPreciseNew: levelPreciseChange?.newValue,
        });
      }

      for (const change of song.fieldChanges) {
        if (change.field === "level" || change.field === "levelPrecise" || change.field === "cover") continue;
        if (!otherBuckets[change.field]) otherBuckets[change.field] = [];
        otherBuckets[change.field].push({
          songName: song.songName,
          type: song.type,
          difficulty: song.difficulty,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }
    }

    // Level section first, grouped by song with one segment per difficulty
    if (levelBucket.length > 0) {
      description += `**${levelBucket.length} Level Change${levelBucket.length > 1 ? 's' : ''}**\n`;
      const lines = groupChartLines(levelBucket, change => {
        const diff = difficultyShort(change.difficulty);
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

    // Other fields alphabetically
    for (const field of Object.keys(otherBuckets).sort()) {
      const entries = otherBuckets[field];
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      description += `**${entries.length} ${fieldLabel} Change${entries.length > 1 ? 's' : ''}**\n`;
      const lines = groupOtherFieldLines(entries);
      description += truncateLines(lines, OTHER_TRUNCATE_LIMIT) + "\n\n";
    }
  }

  return description;
}

export async function sendDiscordWebhook(
  region: Region,
  added: AddedChange[],
  deleted: DeletedChange[],
  modified: ModifiedChange[],
) {
  const regionKey = `DISCORD_UPDATE_WEBHOOK_${region.toUpperCase()}`;
  const webhookUrl = process.env[regionKey] ?? process.env.DISCORD_UPDATE_WEBHOOK;
  if (!webhookUrl) {
    logger.debug({ region }, "DISCORD_UPDATE_WEBHOOK not set, skipping webhook notification");
    return;
  }

  // Filter out songs whose only changes are cover (noisy, not useful)
  const filteredModified = modified.filter(
    m => m.fieldChanges.some(c => c.field !== "cover")
  );

  if (added.length === 0 && deleted.length === 0 && filteredModified.length === 0) {
    logger.debug({ region }, "No changes detected, skipping webhook notification");
    return;
  }

  const now = new Date();

  // Format date in JST (Japan Standard Time)
  const jstDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [month, day, year] = jstDate.split('/');
  const dateStr = `${year}/${month}/${day}`;
  const regionName = region === "jp" ? "Japan" : region === "cn" ? "China" : "International";

  const description = buildChangeDescription(added, deleted, filteredModified);

  // Determine color based on changes
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

  const baseUrl = resolveBaseUrl();
  const payload = {
    username: "ともマイ",
    avatar_url: `${baseUrl}/icon.png`,
    embeds: [
      {
        title: `Song data update - ${dateStr} - ${regionName}`,
        description: truncateForDiscord(description.trim() || "No changes detected"),
        color: color,
        timestamp: now.toISOString(),
      },
    ],
  };

  deliverInBackground(async () => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ region, status: response.status, statusText: response.statusText, body: errorText }, "Discord webhook failed");
    } else {
      logger.info({ region }, "Discord webhook sent");
    }
  });
}

export async function sendDiscordNotice(
  region: Region,
  title: string,
  description: string,
  color: number = 0x5865F2,
) {
  const webhookUrl = process.env.DISCORD_UPDATE_WEBHOOK_NOTICE;
  if (!webhookUrl) return;

  const baseUrl = resolveBaseUrl();
  const regionName = region === "jp" ? "Japan" : region === "cn" ? "China" : "International";

  const payload = {
    username: "ともマイ",
    avatar_url: `${baseUrl}/icon.png`,
    embeds: [
      {
        title: `[${regionName}] ${title}`,
        description: truncateForDiscord(description.trim()) || undefined,
        color,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  deliverInBackground(async () => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ region, status: response.status, statusText: response.statusText, body: errorText }, "Discord notice webhook failed");
    }
  });
}
