import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { rateLimit } from "@tomomai/security/rate-limit";
import { readLimiter } from "@/lib/rate-limit";
import { getToday } from "@/lib/today";
import { getRealTodayKey } from "@/lib/date-slug";
import {
  audioModifier,
  getAudioPreview,
  sourceAudioDuration,
  type AudioModifier,
} from "@/lib/heardle";
import { getPuzzleVersion } from "@/lib/puzzle-version";
import { TOTAL_STEPS } from "@/lib/types";
import { Rng } from "@/lib/rng";

export const runtime = "nodejs";

// Module-level LRU keyed by `${dateKey}:${level}`. Mirrors the image route
// pattern — Map preserves insertion order, `get` reinserts to refresh recency.
// Audio bytes are small (typically <40KB at 96kbit/s for short clips) so we
// can hold a few times more than the image cache.
const AUDIO_CACHE_MAX = 128;
const audioCache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const buf = audioCache.get(key);
  if (buf === undefined) return undefined;
  audioCache.delete(key);
  audioCache.set(key, buf);
  return buf;
}

function cacheSet(key: string, buf: Buffer): void {
  if (audioCache.has(key)) audioCache.delete(key);
  audioCache.set(key, buf);
  if (audioCache.size > AUDIO_CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    if (oldest !== undefined) audioCache.delete(oldest);
  }
}

/**
 * Map the URL `[date]` segment to a canonical dateKey, or null if the slug
 * isn't allowed. Accepts YYYYMMDD for real dates (today + past) and
 * `debug<X>` for debug runs (must match the server's DEBUG_KEY exactly).
 * Future dates and unknown debug labels return null → 404.
 */
function resolveSlug(slug: string): string | null {
  if (slug.startsWith("debug")) {
    const debugKey = process.env.DEBUG_KEY;
    if (!debugKey) return null;
    if (slug !== `debug${debugKey}`) return null;
    return `debug-${debugKey}`;
  }
  if (!/^\d{8}$/.test(slug)) return null;
  const dateKey = `${slug.slice(0, 4)}-${slug.slice(4, 6)}-${slug.slice(6, 8)}`;
  if (dateKey > getRealTodayKey()) return null;
  return dateKey;
}

/** Build the ffmpeg argv. `sourceSec` is the length of source to read. */
function ffmpegArgs(sourceUrl: string, sourceSec: number, modifier: AudioModifier): string[] {
  // `-t` BEFORE `-i` caps how many seconds of input we read. Output length
  // is whatever the filter chain produces from that input: same for plain,
  // same for pitch (true pitch shift preserves length), `sourceSec / rate`
  // for speed (atempo stretches or compresses).
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-t",
    sourceSec.toFixed(3),
    "-i",
    sourceUrl,
  ];
  if (modifier.kind === "speed") {
    args.push("-af", `atempo=${modifier.rate}`);
  } else if (modifier.kind === "pitch") {
    const factor = Math.pow(2, modifier.semitones / 12);
    args.push(
      "-af",
      `asetrate=44100*${factor.toFixed(6)},aresample=44100,atempo=${(1 / factor).toFixed(6)}`,
    );
  }
  // Opus in WebM is universally supported in modern browsers, small, and
  // streamable from stdout (unlike m4a, whose moov atom needs the whole
  // file before it can be written).
  args.push(
    "-vn",
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "-f",
    "webm",
    "pipe:1",
  );
  return args;
}

function runFfmpeg(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary not available"));
      return;
    }
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`,
          ),
        );
      }
    });
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ date: string; level: string }> },
) {
  const limited = await rateLimit(req, readLimiter);
  if (limited) return limited;

  const { date: slug, level: levelStr } = await context.params;

  const dateKey = resolveSlug(slug);
  if (!dateKey) {
    return NextResponse.json({ error: "invalid date" }, { status: 404 });
  }

  // v2-only route. v1 puzzles use the direct Apple URL; rejecting here
  // prevents the route from masking that contract during partial rollouts.
  if (getPuzzleVersion(dateKey) !== 2) {
    return NextResponse.json({ error: "audio route is v2-only" }, { status: 404 });
  }

  const level = Number.parseInt(levelStr, 10);
  if (!Number.isInteger(level) || level < 0 || level >= TOTAL_STEPS - 1) {
    return NextResponse.json({ error: "level out of range" }, { status: 400 });
  }

  const cacheKey = `${dateKey}:${level}`;
  let buf = cacheGet(cacheKey);
  if (!buf) {
    // Resolve the chart from the dateKey. `getToday` accepts an override; for
    // today/debug we pass undefined so its own getDateKey() + DEBUG_KEY logic
    // produces the same result resolveSlug just validated against.
    const todayKey = getRealTodayKey();
    const isTodayOrDebug =
      dateKey.startsWith("debug-") || dateKey === todayKey;
    const { chart } = await getToday(isTodayOrDebug ? undefined : dateKey);
    const preview = getAudioPreview(chart);
    if (!preview) {
      return NextResponse.json({ error: "no preview for this chart" }, { status: 404 });
    }
    const variantRoll = new Rng(`${dateKey}:audio:${level}:variant`).intBelow(3);
    const pitchRoll = new Rng(`${dateKey}:audio:${level}:pitch`).intBelow(2);
    const modifier = audioModifier(2, level, variantRoll, pitchRoll);
    const sourceSec = sourceAudioDuration(level, modifier, 2);
    buf = await runFfmpeg(ffmpegArgs(preview.previewUrl, sourceSec, modifier));
    cacheSet(cacheKey, buf);
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/webm",
      // Immutable: the (dateKey, level) pair fully determines the bytes.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
