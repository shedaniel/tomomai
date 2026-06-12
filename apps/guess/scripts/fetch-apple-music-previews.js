#!/usr/bin/env node
// Fetch Apple Music / iTunes 30s preview URLs for the maimai song catalog and
// emit a JSON map keyed by `<songName>|<artist>`. See plan in
// .claude/plans/let-s-do-apple-music-staged-quail.md.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

try {
  process.loadEnvFile(resolve(APP_ROOT, ".env.local"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const OUTPUT_PATH = join(APP_ROOT, "src/data/apple-music-previews.json");
const CACHE_DIR = join(APP_ROOT, ".cache/itunes");

const CATALOG_URL =
  process.env.TOMOMAI_API_URL?.replace(/\/$/, "") ?? "https://www.tomomai.lol";
const ITUNES_BASE = "https://itunes.apple.com/search";
const COUNTRY = "jp";
const RATE_LIMIT_MS = 3500; // iTunes Search caps at ~20 req/min per IP
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 5000; // 403s persist for a while; start high
const PROXY_LIST_URL = process.env.WEBSHARE_PROXY_LIST_URL ?? null;
const MAX_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? 20);

// ---------- text helpers --------------------------------------------------

function stripUtageBracket(s) {
  // maimai prepends one-char bracket prefixes to utage / contest charts
  // (e.g. "[協]Hand in Hand"). iTunes doesn't carry these, so strip for matching.
  return s.replace(/^\s*\[[^\]]{1,3}\]\s*/, "");
}

// Strip subtitles / annotations that appear on one side but not the other.
// Apple side typically adds "(feat. X)", "(Anime Size Ver.)", "[Remix]" etc.
// maimai side adds "[cover]", "(Band ver.)", " -version-" etc.
function stripAnnotations(s) {
  let out = s;
  // Parenthesized/bracketed feat tags
  out = out.replace(/\s*[\(（\[]\s*(feat|ft|featuring)[\s.][^\)\]）]*[\)）\]]/gi, "");
  // Trailing " feat. ..." with no closing bracket
  out = out.replace(/\s+(feat|ft|featuring)[\s.].*$/i, "");
  // Trailing " [cover]" annotation (maimai-side)
  out = out.replace(/\s*\[cover\]\s*$/i, "");
  // Generic trailing parenthetical/bracketed suffix (Anime Size Ver., Live, Remix, etc.)
  // Only consumed once — preserves "Oshama Scramble! (Cranky Remix)" sort of structure
  // in the original string; this is used only for the looser comparison pass.
  out = out.replace(/\s*[\(（\[][^\)\]）]+[\)）\]]\s*$/, "");
  // Trailing tilde/dash-wrapped subtitle: " -X-", " ~X~", " 〜X〜"
  out = out.replace(/\s+[\-~〜～][^\-~〜～]+[\-~〜～]\s*$/, "");
  return out.trim();
}

function normalize(s) {
  return stripUtageBracket(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeLoose(s) {
  return normalize(stripAnnotations(stripUtageBracket(s)));
}

function tokens(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function artistMatches(maimaiArtist, appleArtist) {
  const mFlat = normalize(maimaiArtist);
  const aFlat = normalize(appleArtist);
  if (!mFlat || !aFlat) return false;
  if (mFlat === aFlat) return true;
  if (mFlat.includes(aFlat) || aFlat.includes(mFlat)) return true;
  // Token-level fallback: any ≥2-char token from one side appears in the
  // other's flat form. Catches "樋口楓" vs "樋口 楓" and "myu314 feat.あまね" vs "COOL&CREATE".
  const mToks = tokens(maimaiArtist).filter((t) => t.length >= 2);
  const aToks = tokens(appleArtist).filter((t) => t.length >= 2);
  if (mToks.some((t) => aFlat.includes(t))) return true;
  if (aToks.some((t) => mFlat.includes(t))) return true;
  return false;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// ---------- iTunes lookup -------------------------------------------------

async function ensureCache() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cachePath(term) {
  const h = createHash("sha1").update(`${COUNTRY}:${term}`).digest("hex");
  return join(CACHE_DIR, `${h}.json`);
}

async function readCache(term) {
  const p = cachePath(term);
  try {
    await stat(p);
  } catch {
    return null;
  }
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw);
}

async function writeCache(term, body) {
  await writeFile(cachePath(term), JSON.stringify(body));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- proxy pool ----------------------------------------------------
// Each proxy gets its own rate-limit window. Webshare downloads come as
// `host:port:user:pass` lines. We round-robin and pick the next-available
// proxy by lastCallAt + cooldown.

/** @type {{ id: string; agent: import("undici").ProxyAgent | null; lastCallAt: number; cooldownUntil: number; networkFails: number; dead: boolean }[]} */
const proxyPool = [];
const DEAD_AFTER_FAILS = 3;
const NETWORK_COOLDOWN_MS = 30_000;

async function loadProxies() {
  if (!PROXY_LIST_URL) {
    proxyPool.push({
      id: "direct",
      agent: null,
      lastCallAt: 0,
      cooldownUntil: 0,
      networkFails: 0,
      dead: false,
    });
    console.log("No WEBSHARE_PROXY_LIST_URL — using direct connection (1 IP, ~17 req/min).");
    return;
  }
  console.log("Fetching proxy list…");
  const res = await fetch(PROXY_LIST_URL);
  if (!res.ok) throw new Error(`Proxy list fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 4) continue;
    const [host, port, user, pass] = parts;
    const uri = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    proxyPool.push({
      id: `${host}:${port}`,
      agent: new ProxyAgent(uri),
      lastCallAt: 0,
      cooldownUntil: 0,
      networkFails: 0,
      dead: false,
    });
  }
  if (!proxyPool.length) {
    throw new Error("Proxy list was empty");
  }
  console.log(`Loaded ${proxyPool.length} proxies — effective rate ~${Math.round((60_000 / RATE_LIMIT_MS) * proxyPool.length)} req/min.`);
}

// Serialise proxy reservation across concurrent workers so two workers can't
// both grab the same proxy in the same tick.
let acquireChain = Promise.resolve();

function acquireProxy() {
  const job = acquireChain.then(async () => {
    while (true) {
      const now = Date.now();
      let best = null;
      let bestReadyAt = Infinity;
      for (const p of proxyPool) {
        if (p.dead) continue;
        const readyAt = Math.max(p.lastCallAt + RATE_LIMIT_MS, p.cooldownUntil);
        if (readyAt < bestReadyAt) {
          bestReadyAt = readyAt;
          best = p;
        }
      }
      if (!best) throw new Error("All proxies are dead.");
      const wait = bestReadyAt - now;
      if (wait <= 0) {
        best.lastCallAt = Date.now();
        return best;
      }
      // If everyone is busy, release the chain while we wait so other workers
      // can re-check after their own reservations complete.
      await sleep(Math.min(wait, 50));
    }
  });
  acquireChain = job.catch(() => {});
  return job;
}

function aliveCount() {
  return proxyPool.filter((p) => !p.dead).length;
}

async function itunesSearch(term) {
  const cached = await readCache(term);
  if (cached) return cached;

  const url = `${ITUNES_BASE}?term=${encodeURIComponent(term)}&entity=song&limit=10&country=${COUNTRY}`;
  let rateLimitAttempts = 0;
  while (rateLimitAttempts < MAX_RETRIES) {
    const proxy = await acquireProxy();
    let res;
    try {
      res = await fetch(url, {
        headers: { "user-agent": "tomomai-heardle-coverage/0.1" },
        dispatcher: proxy.agent ?? undefined,
      });
    } catch (err) {
      proxy.networkFails++;
      proxy.cooldownUntil = Date.now() + NETWORK_COOLDOWN_MS;
      if (proxy.networkFails >= DEAD_AFTER_FAILS) {
        proxy.dead = true;
        console.warn(`  ☠ proxy ${proxy.id} dead after ${proxy.networkFails} fails (${aliveCount()} alive)`);
      } else {
        console.warn(`  ⚠ network error via ${proxy.id}: ${err.message} (fail ${proxy.networkFails}/${DEAD_AFTER_FAILS})`);
      }
      continue; // network errors don't burn retry budget
    }
    proxy.networkFails = 0; // reset on any successful HTTP response
    if (res.status === 403 || res.status === 429) {
      rateLimitAttempts++;
      const backoff = 2 ** rateLimitAttempts * BACKOFF_BASE_MS;
      console.warn(`  rate limited (${res.status}) via ${proxy.id}, cooling down ${backoff}ms`);
      proxy.cooldownUntil = Date.now() + backoff;
      continue;
    }
    if (!res.ok) {
      throw new Error(`iTunes search failed: ${res.status} ${res.statusText} for ${url}`);
    }
    const body = await res.json();
    await writeCache(term, body);
    return body;
  }
  throw new Error(`iTunes search exhausted retries for ${term}`);
}

// ---------- matching ------------------------------------------------------

function pickMatch(songName, artist, results) {
  if (!results.length) return null;
  const sNorm = normalize(songName);
  const sLoose = normalizeLoose(songName);

  let best = null;
  for (const r of results) {
    if (!r.previewUrl || !r.trackName) continue;

    // Title comparison: try strict normalize first, then loose (annotation-stripped).
    // Track tier: 0 = exact strict, 1 = exact loose, 2..N = fuzzy distance + offset.
    const tNorm = normalize(r.trackName);
    const tLoose = normalizeLoose(r.trackName);
    let trackTier = null;
    let confidence = null;
    if (tNorm === sNorm) {
      trackTier = 0;
      confidence = "exact";
    } else if (tLoose && sLoose && tLoose === sLoose) {
      trackTier = 1;
      confidence = "loose";
    } else {
      // Length-scaled fuzzy on the loose-normalized form
      const a = tLoose || tNorm;
      const b = sLoose || sNorm;
      const len = Math.min(a.length, b.length);
      const maxDist = Math.max(1, Math.floor(len / 8));
      const d = levenshtein(a, b);
      if (d > maxDist) continue;
      trackTier = 10 + d;
      confidence = "fuzzy";
    }

    if (!artistMatches(artist, r.artistName ?? "")) continue;

    const score = trackTier;
    if (!best || score < best.score) {
      best = {
        score,
        confidence,
        entry: {
          previewUrl: r.previewUrl,
          trackId: r.trackId,
          trackName: r.trackName,
          artistName: r.artistName,
          artworkUrl: r.artworkUrl100 ?? r.artworkUrl60 ?? null,
          matchConfidence: confidence,
        },
      };
    }
  }
  return best;
}

async function resolveSong(songName, artist) {
  const cleanName = stripUtageBracket(songName);
  const queries = [`${cleanName} ${artist}`, cleanName];
  const seen = new Set();
  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const body = await itunesSearch(trimmed);
    const match = pickMatch(songName, artist, body.results ?? []);
    if (match) return match;
  }
  return null;
}

// ---------- catalog -------------------------------------------------------

async function fetchCatalog() {
  const url = `${CATALOG_URL}/api/v1/maimai/songs`;
  console.log(`Fetching catalog: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const body = await res.json();
  return body.songs;
}

function uniqueSongs(charts) {
  const seen = new Map();
  for (const c of charts) {
    if (c.region !== "jp") continue;
    if (c.cover == null) continue;
    if (c.type === "utage" || c.difficulty === "utage") continue;
    const key = `${c.songName}|${c.artist}`;
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        songName: c.songName,
        artist: c.artist,
        genre: c.genre,
      });
    }
  }
  return [...seen.values()];
}

// ---------- output --------------------------------------------------------

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { songs: {} };
  }
}

async function writeOutput(data) {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n");
}

// ---------- debug mode ----------------------------------------------------

async function debugUnmatched(genreFilter, sampleSize) {
  const existing = await loadExisting();
  const unmatched = (existing.unmatched ?? []).filter(
    (u) => !genreFilter || u.genre === genreFilter,
  );
  if (!unmatched.length) {
    console.log(`No unmatched entries${genreFilter ? ` for genre "${genreFilter}"` : ""}.`);
    return;
  }
  // Random sample
  const shuffled = [...unmatched].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, sampleSize);
  console.log(`Sampling ${sample.length}/${unmatched.length} unmatched in "${genreFilter ?? "(all)"}"`);

  for (const u of sample) {
    const cleanName = stripUtageBracket(u.songName);
    console.log("\n" + "═".repeat(70));
    console.log(`maimai: ${u.songName} — ${u.artist}`);
    if (cleanName !== u.songName) console.log(`  (stripped: ${cleanName})`);
    console.log(`  normalized song: "${normalize(u.songName)}"`);
    console.log(`  normalized artist tokens: [${tokens(u.artist).join(", ")}]`);

    for (const q of [`${cleanName} ${u.artist}`, cleanName]) {
      console.log(`\n  query → "${q}"`);
      let body;
      try {
        body = await itunesSearch(q);
      } catch (err) {
        console.log(`    ERROR: ${err.message}`);
        continue;
      }
      const results = (body.results ?? []).slice(0, 5);
      if (!results.length) {
        console.log(`    (no results)`);
        continue;
      }
      const sNorm = normalize(u.songName);
      const sLoose = normalizeLoose(u.songName);
      for (const r of results) {
        const tNorm = normalize(r.trackName ?? "");
        const tLoose = normalizeLoose(r.trackName ?? "");
        let trackTier;
        if (tNorm === sNorm) trackTier = "exact";
        else if (tLoose && sLoose && tLoose === sLoose) trackTier = "loose";
        else {
          const a = tLoose || tNorm;
          const b = sLoose || sNorm;
          const len = Math.min(a.length, b.length);
          const maxDist = Math.max(1, Math.floor(len / 8));
          const d = levenshtein(a, b);
          trackTier = d <= maxDist ? `fuzzy(d${d}≤${maxDist})` : `fail(d${d}>${maxDist})`;
        }
        const artistOk = artistMatches(u.artist, r.artistName ?? "");
        const trackOk = !trackTier.startsWith("fail");
        const verdict = trackOk && artistOk ? `✓ ${trackTier}` : `✗ track=${trackTier} artist=${artistOk ? "y" : "n"}`;
        console.log(`    ${verdict}  "${r.trackName}" — ${r.artistName}${r.previewUrl ? "" : " (no preview)"}`);
      }
    }
  }
}

// ---------- main ----------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const debugIdx = args.indexOf("--debug-unmatched");
  if (debugIdx !== -1) {
    const genre = args[debugIdx + 1] && !args[debugIdx + 1].startsWith("--") ? args[debugIdx + 1] : null;
    const sampleArg = args.indexOf("--sample");
    const sampleSize = sampleArg !== -1 ? Number(args[sampleArg + 1]) : 10;
    await ensureCache();
    await loadProxies();
    await debugUnmatched(genre, sampleSize);
    return;
  }

  await ensureCache();
  await loadProxies();
  const [catalog, existing] = await Promise.all([fetchCatalog(), loadExisting()]);
  const songs = uniqueSongs(catalog);
  console.log(`Unique songs: ${songs.length}`);
  console.log(`Already resolved: ${Object.keys(existing.songs).length}`);

  const out = { ...existing.songs };
  const unmatched = [];
  const unmatchedByGenre = new Map();
  let processed = 0;
  let exactCount = 0;
  let looseCount = 0;
  let fuzzyCount = 0;
  let sinceLastWrite = 0;
  let writing = null;

  const snapshot = () => ({
    generatedAt: new Date().toISOString(),
    songs: out,
    unmatched,
    stats: {
      total: songs.length,
      matched: exactCount + looseCount + fuzzyCount,
      exact: exactCount,
      loose: looseCount,
      fuzzy: fuzzyCount,
      unmatched: unmatched.length,
    },
  });

  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, aliveCount()));
  console.log(`Running ${concurrency} workers in parallel.`);

  const queue = [...songs];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const idx = cursor++;
      const s = queue[idx];
      processed++;
      const tag = `[${processed}/${songs.length}]`;
      if (out[s.key]) {
        const c = out[s.key].matchConfidence;
        if (c === "exact") exactCount++;
        else if (c === "loose") looseCount++;
        else fuzzyCount++;
        continue;
      }
      try {
        const match = await resolveSong(s.songName, s.artist);
        if (match) {
          out[s.key] = match.entry;
          if (match.confidence === "exact") exactCount++;
          else if (match.confidence === "loose") looseCount++;
          else fuzzyCount++;
          const mark = match.confidence === "exact" ? "✓" : match.confidence === "loose" ? "≈" : "~";
          console.log(`${tag} ${mark} ${s.songName} — ${s.artist}`);
        } else {
          unmatched.push({ songName: s.songName, artist: s.artist, genre: s.genre });
          unmatchedByGenre.set(s.genre, (unmatchedByGenre.get(s.genre) ?? 0) + 1);
          console.log(`${tag} ✗ ${s.songName} — ${s.artist}`);
        }
      } catch (err) {
        console.error(`${tag} ! error resolving ${s.songName}:`, err.message);
        unmatched.push({
          songName: s.songName,
          artist: s.artist,
          genre: s.genre,
          error: err.message,
        });
      }

      sinceLastWrite++;
      if (sinceLastWrite >= 50 && !writing) {
        sinceLastWrite = 0;
        writing = writeOutput(snapshot()).finally(() => {
          writing = null;
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (writing) await writing;

  const stats = {
    total: songs.length,
    matched: exactCount + looseCount + fuzzyCount,
    exact: exactCount,
    loose: looseCount,
    fuzzy: fuzzyCount,
    unmatched: unmatched.length,
  };
  await writeOutput({
    generatedAt: new Date().toISOString(),
    songs: out,
    unmatched,
    stats,
  });

  const pct = (n) => ((n / songs.length) * 100).toFixed(1);
  console.log("");
  console.log("─── Coverage ─────────────────────────────────────");
  console.log(`Total unique songs:  ${stats.total}`);
  console.log(`  matched (exact):   ${stats.exact} (${pct(stats.exact)}%)`);
  console.log(`  matched (loose):   ${stats.loose} (${pct(stats.loose)}%)`);
  console.log(`  matched (fuzzy):   ${stats.fuzzy} (${pct(stats.fuzzy)}%)`);
  console.log(`  unmatched:         ${stats.unmatched} (${pct(stats.unmatched)}%)`);
  console.log("");
  const topGenres = [...unmatchedByGenre.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (topGenres.length) {
    console.log("Top unmatched genres:");
    for (const [genre, n] of topGenres) {
      console.log(`  ${genre.padEnd(30)} ${n}`);
    }
  }
  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
