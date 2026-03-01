import { resolveBaseUrl } from "@/lib/base-url";
import type { AddedChange, DeletedChange, ModifiedChange } from "@/app/api/admin/upload/route";
import { Difficulty, Region } from "@/lib/types";

function formatSongLabel(song: { songName: string; type: string; difficulty: Difficulty }): string {
  return `${song.songName} ${song.type.toUpperCase()} ${song.difficulty.slice(0, 3).toUpperCase()}`;
}

function formatPrecise(value: number): string {
  return (value / 10).toFixed(1);
}

function formatSongKey(songKey: string): string {
  const parts = songKey.split("@");
  if (parts.length !== 3) return songKey.replaceAll("@", " ");
  const [songName, type, difficulty] = parts;
  return `${songName} ${type.toUpperCase()} ${difficulty.slice(0, 3).toUpperCase()}`;
}

function songSortKey(a: { songName: string; type: string; difficulty: string }, b: { songName: string; type: string; difficulty: string }) {
  return a.songName.localeCompare(b.songName) * 1000000 + a.type.localeCompare(b.type) * 1000 + a.difficulty.localeCompare(b.difficulty);
}

const LEVEL_TRUNCATE_LIMIT = 15;
const OTHER_TRUNCATE_LIMIT = 5;

function truncateLines(lines: string[], limit: number): string {
  if (lines.length <= limit) return lines.join("\n");
  const extra = lines.length - limit;
  return lines.slice(0, limit).join("\n") + `\n... and ${extra} more changes`;
}

export async function sendDiscordWebhook(
  region: "intl" | "jp",
  added: AddedChange[],
  deleted: DeletedChange[],
  modified: ModifiedChange[],
) {
  const webhookUrl = process.env.DISCORD_UPDATE_WEBHOOK;
  if (!webhookUrl) {
    console.log("DISCORD_UPDATE_WEBHOOK not set, skipping webhook notification");
    return;
  }

  // Filter out songs whose only changes are cover (noisy, not useful)
  const filteredModified = modified.filter(
    m => m.fieldChanges.some(c => c.field !== "cover")
  );

  if (added.length === 0 && deleted.length === 0 && filteredModified.length === 0) {
    console.log("No changes detected, skipping webhook notification");
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
  const regionName = region === "jp" ? "Japan" : "International";

  let description = "";

  // Added charts
  if (added.length > 0) {
    description += `**${added.length} Chart${added.length > 1 ? 's' : ''} Added**\n`;
    const lines = added.toSorted(songSortKey).map(
      song => `- ${formatSongLabel(song)} ${song.level} (${song.levelPrecise ? formatPrecise(song.levelPrecise) : 'unknown'})`
    );
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  // Deleted charts
  if (deleted.length > 0) {
    description += `**${deleted.length} Chart${deleted.length > 1 ? 's' : ''} Deleted**\n`;
    const lines = deleted.toSorted(songSortKey).map(
      song => `- ${formatSongLabel(song)} ${song.level} (${song.levelPrecise ? formatPrecise(song.levelPrecise) : 'unknown'})`
    );
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }

  // Modified charts grouped by field
  if (filteredModified.length > 0) {
    type LevelEntry = { songKey: string; oldValue?: any; newValue?: any; levelPreciseOld?: any; levelPreciseNew?: any };
    type OtherEntry = { songKey: string; oldValue: any; newValue: any };

    const levelBucket: LevelEntry[] = [];
    const otherBuckets: Record<string, OtherEntry[]> = {};

    for (const song of filteredModified) {
      const levelChange = song.fieldChanges.find(c => c.field === "level");
      const levelPreciseChange = song.fieldChanges.find(c => c.field === "levelPrecise");

      if (levelChange || levelPreciseChange) {
        levelBucket.push({
          songKey: song.songKey,
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
          songKey: song.songKey,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }
    }

    // Level section first
    if (levelBucket.length > 0) {
      description += `**${levelBucket.length} Level Change${levelBucket.length > 1 ? 's' : ''}**\n`;
      const lines = levelBucket.map(change => {
        const hasBoth = (change.oldValue !== undefined || change.newValue !== undefined) &&
          (change.levelPreciseOld !== undefined || change.levelPreciseNew !== undefined);
        const label = formatSongKey(change.songKey);
        if (hasBoth) {
          const preciseOld = change.levelPreciseOld !== undefined ? formatPrecise(change.levelPreciseOld) : "?";
          const preciseNew = change.levelPreciseNew !== undefined ? formatPrecise(change.levelPreciseNew) : "?";
          return `- ${label}: ${change.oldValue ?? "?"} (${preciseOld}) → ${change.newValue ?? "?"} (${preciseNew})`;
        } else if (change.oldValue !== undefined || change.newValue !== undefined) {
          return `- ${label}: Level: ${change.oldValue ?? "?"} → ${change.newValue ?? "?"}`;
        } else {
          const preciseOld = change.levelPreciseOld !== undefined ? formatPrecise(change.levelPreciseOld) : "?";
          const preciseNew = change.levelPreciseNew !== undefined ? formatPrecise(change.levelPreciseNew) : "?";
          return `- ${label}: Precise: ${preciseOld} → ${preciseNew}`;
        }
      });
      description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
    }

    // Other fields alphabetically
    for (const field of Object.keys(otherBuckets).sort()) {
      const entries = otherBuckets[field];
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      description += `**${entries.length} ${fieldLabel} Change${entries.length > 1 ? 's' : ''}**\n`;
      const lines = entries.map(change => {
        const label = formatSongKey(change.songKey);
        const oldObj = change.oldValue && typeof change.oldValue === "object" ? change.oldValue as Record<string, unknown> : null;
        const newObj = change.newValue && typeof change.newValue === "object" ? change.newValue as Record<string, unknown> : null;
        if (oldObj && newObj) {
          const diffs = Object.keys({ ...oldObj, ...newObj })
            .filter(k => oldObj[k] !== newObj[k])
            .map(k => `${k} ${oldObj[k]}→${newObj[k]}`)
            .join(", ");
          return `- ${label}: ${diffs}`;
        } else if (!oldObj && newObj) {
          const summary = Object.entries(newObj).map(([k, v]) => `${k}:${v}`).join(" ");
          return `- ${label}: (new) ${summary}`;
        } else if (oldObj && !newObj) {
          const summary = Object.entries(oldObj).map(([k, v]) => `${k}:${v}`).join(" ");
          return `- ${label}: (removed) ${summary}`;
        }
        const oldVal = change.oldValue;
        const newVal = change.newValue;
        return `- ${label}: ${oldVal} → ${newVal}`;
      });
      description += truncateLines(lines, OTHER_TRUNCATE_LIMIT) + "\n\n";
    }
  }

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
        description: description.trim() || "No changes detected",
        color: color,
        timestamp: now.toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Discord webhook error response: ${errorText}`);
    } else {
      console.log("Discord webhook sent successfully");
    }
  } catch (error) {
    console.error("Error sending Discord webhook:", error);
  }
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
  const regionName = region === "jp" ? "Japan" : "International";

  const payload = {
    username: "ともマイ",
    avatar_url: `${baseUrl}/icon.png`,
    embeds: [
      {
        title: `[${regionName}] ${title}`,
        description: description.trim().slice(0, 4000) || undefined,
        color,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Discord notice webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending Discord notice webhook:", error);
  }
}
