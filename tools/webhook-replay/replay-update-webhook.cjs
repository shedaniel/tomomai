#!/usr/bin/env node
// One-off recovery: replay a missed "Song data update" Discord webhook from a
// Cronicle update_all log. The formatting here is a VERBATIM port of
// apps/main/src/server/services/admin/discord-webhooks.ts (sendDiscordWebhook)
// so the replayed message matches what would have been posted.
//
// Why this exists: on 2026/06/09 the CN update_all run added 110 / modified 126
// / deleted 22, but the Discord notification never arrived. Two stacked bugs:
//   1. upload/route.ts fires sendDiscordWebhook() fire-and-forget (no after()/
//      waitUntil), so on Vercel the function froze before the fetch completed.
//   2. The CN embed description was 4779 chars, over Discord's 4096 limit, so
//      even if sent it would have 400'd. sendDiscordWebhook never caps length.
//
// Usage:
//   node replay-update-webhook.cjs <response.json> <region>                  # dry run (no network)
//   WEBHOOK_URL=... node replay-update-webhook.cjs <response.json> cn --trim --send
//
// Flags:
//   --trim   cap embed description at Discord's 4096 limit (line-boundary cut)
//   --send   actually POST to $WEBHOOK_URL (otherwise prints the payload only)
//
// <response.json> may be the update_all envelope ({ cn: {...} }) or a bare
// upload body ({ changes: {...} }).

// ---- knobs ---------------------------------------------------------------
const BASE_URL = process.env.BASE_URL || "https://tomomai.lol"; // avatar/icon only (cosmetic)
// Pin "now" to the original job start so the embed title date (JST) and footer
// timestamp match the missed run. Original Cronicle job: 2026/06/09 17:02:29 GMT.
const NOW = new Date(process.env.OVERRIDE_NOW || "2026-06-09T17:02:29Z");
const TRIM = process.argv.includes("--trim");
const TRIM_MAX = 4096;
const TRIM_MARKER = "\n… (truncated)";

function trimDescription(desc) {
  if (desc.length <= TRIM_MAX) return desc;
  const budget = TRIM_MAX - TRIM_MARKER.length;
  let cut = desc.lastIndexOf("\n", budget);
  if (cut < budget * 0.5) cut = budget; // no nearby newline: hard cut
  return desc.slice(0, cut).trimEnd() + TRIM_MARKER;
}

// ---- verbatim port from discord-webhooks.ts ------------------------------
function formatSongLabel(song) {
  return `${song.songName} ${song.type.toUpperCase()} ${song.difficulty.slice(0, 3).toUpperCase()}`;
}
function formatPrecise(v) { return (v / 10).toFixed(1); }
function formatSongKey(songKey) {
  const parts = songKey.split("@");
  if (parts.length !== 3) return songKey.replaceAll("@", " ");
  const [songName, type, difficulty] = parts;
  return `${songName} ${type.toUpperCase()} ${difficulty.slice(0, 3).toUpperCase()}`;
}
function songSortKey(a, b) {
  return a.songName.localeCompare(b.songName) * 1000000 + a.type.localeCompare(b.type) * 1000 + a.difficulty.localeCompare(b.difficulty);
}
const LEVEL_TRUNCATE_LIMIT = 32;
const OTHER_TRUNCATE_LIMIT = 8;
function truncateLines(lines, limit) {
  if (lines.length <= limit) return lines.join("\n");
  const extra = lines.length - limit;
  return lines.slice(0, limit).join("\n") + `\n... and ${extra} more changes`;
}

function buildPayload(region, added, deleted, modified) {
  const filteredModified = modified.filter(m => m.fieldChanges.some(c => c.field !== "cover"));
  if (added.length === 0 && deleted.length === 0 && filteredModified.length === 0) return null;

  const now = NOW;
  const jstDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [month, day, year] = jstDate.split('/');
  const dateStr = `${year}/${month}/${day}`;
  const regionName = region === "jp" ? "Japan" : region === "cn" ? "China" : "International";

  let description = "";
  if (added.length > 0) {
    description += `**${added.length} Chart${added.length > 1 ? 's' : ''} Added**\n`;
    const lines = added.toSorted(songSortKey).map(
      song => `- ${formatSongLabel(song)} ${song.level} (${song.levelPrecise ? formatPrecise(song.levelPrecise) : 'unknown'})`
    );
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }
  if (deleted.length > 0) {
    description += `**${deleted.length} Chart${deleted.length > 1 ? 's' : ''} Deleted**\n`;
    const lines = deleted.toSorted(songSortKey).map(
      song => `- ${formatSongLabel(song)} ${song.level} (${song.levelPrecise ? formatPrecise(song.levelPrecise) : 'unknown'})`
    );
    description += truncateLines(lines, LEVEL_TRUNCATE_LIMIT) + "\n\n";
  }
  if (filteredModified.length > 0) {
    const levelBucket = [];
    const otherBuckets = {};
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
        otherBuckets[change.field].push({ songKey: song.songKey, oldValue: change.oldValue, newValue: change.newValue });
      }
    }
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
    for (const field of Object.keys(otherBuckets).sort()) {
      const entries = otherBuckets[field];
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      description += `**${entries.length} ${fieldLabel} Change${entries.length > 1 ? 's' : ''}**\n`;
      const lines = entries.map(change => {
        const label = formatSongKey(change.songKey);
        const oldObj = change.oldValue && typeof change.oldValue === "object" ? change.oldValue : null;
        const newObj = change.newValue && typeof change.newValue === "object" ? change.newValue : null;
        if (oldObj && newObj) {
          const diffs = Object.keys({ ...oldObj, ...newObj })
            .filter(k => oldObj[k] !== newObj[k]).map(k => `${k} ${oldObj[k]}→${newObj[k]}`).join(", ");
          return `- ${label}: ${diffs}`;
        } else if (!oldObj && newObj) {
          const summary = Object.entries(newObj).map(([k, v]) => `${k}:${v}`).join(" ");
          return `- ${label}: (new) ${summary}`;
        } else if (oldObj && !newObj) {
          const summary = Object.entries(oldObj).map(([k, v]) => `${k}:${v}`).join(" ");
          return `- ${label}: (removed) ${summary}`;
        }
        return `- ${label}: ${change.oldValue} → ${change.newValue}`;
      });
      description += truncateLines(lines, OTHER_TRUNCATE_LIMIT) + "\n\n";
    }
  }

  const hasLevelChanges = filteredModified.some(m => m.fieldChanges.some(c => c.field === "level" || c.field === "levelPrecise"));
  let color;
  if (deleted.length > 0) color = 0xFF0000;
  else if (added.length > 0) color = 0x00FF00;
  else if (hasLevelChanges) color = 0xFFFF00;
  else color = 0x808080;

  let finalDesc = description.trim() || "No changes detected";
  if (TRIM) finalDesc = trimDescription(finalDesc);

  return {
    username: "ともマイ",
    avatar_url: `${BASE_URL}/icon.png`,
    embeds: [{
      title: `Song data update - ${dateStr} - ${regionName}`,
      description: finalDesc,
      color,
      timestamp: now.toISOString(),
    }],
  };
}

// ---- driver --------------------------------------------------------------
async function main() {
  const [, , file, region] = process.argv;
  const send = process.argv.includes("--send");
  if (!file || !region) {
    console.error("usage: node replay-update-webhook.cjs <response.json> <region> [--trim] [--send]");
    process.exit(1);
  }
  const fs = require("fs");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const body = raw[region] || raw; // unwrap update_all envelope if present
  const changes = body.changes;
  if (!changes) { console.error("No .changes found in body"); process.exit(1); }

  const added = changes.added || [];
  const modified = changes.modified || [];
  // Mirror upload/route.ts: webhook receives only deletions with no play records.
  const actuallyDeleted = (changes.deleted || []).filter(d => (d.playRecordCount ?? 0) === 0);

  // arg order matches sendDiscordWebhook(region, added, deleted, modified)
  const real = buildPayload(region, added, actuallyDeleted, modified);
  if (!real) { console.log("Would skip: no changes."); return; }

  const descLen = real.embeds[0].description.length;
  console.log(`region=${region}  added=${added.length}  deleted(actual)=${actuallyDeleted.length}  modified=${modified.length}`);
  console.log(`embed.title: ${real.embeds[0].title}`);
  console.log(`embed.description length: ${descLen} chars  (Discord limit 4096)` + (descLen > 4096 ? "  *** OVER LIMIT (use --trim) ***" : "  OK"));

  if (!send) {
    console.log("\n----- payload -----");
    console.log(JSON.stringify(real, null, 2));
    console.log("\n[dry run] not sending. Re-run with --send and WEBHOOK_URL set to deliver.");
    return;
  }
  const url = process.env.WEBHOOK_URL;
  if (!url) { console.error("WEBHOOK_URL env not set"); process.exit(1); }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(real),
  });
  const text = await res.text();
  console.log(`\nDiscord responded: ${res.status} ${res.statusText}`);
  if (text) console.log(`body: ${text}`);
  if (!res.ok) process.exit(1);
  console.log("Sent successfully.");
}
main().catch(e => { console.error(e); process.exit(1); });
