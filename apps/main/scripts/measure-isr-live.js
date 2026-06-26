#!/usr/bin/env node
// Measures live ISR payload size + cache state for a list of song-slug URLs.
//
// `next build` does NOT prerender on-demand ISR routes (generateStaticParams
// returns []), so the .next/server/app files won't include /db/songs/[slug].
// To see the real per-slug payload Vercel persists on revalidation, hit the
// live URLs twice with a 1-second gap: the first request is MISS / REVALIDATED
// (forces a regeneration → this is what Vercel bills as an ISR write), the
// second is HIT (cached read, no write). The Content-Length + cache header
// tell us the payload size and write state.
//
// Usage:
//   node scripts/measure-isr-live.js https://your-deploy.url \
//     --slugs "_-x0o0x-dx" "coconut" "shigure" [--locale en,ja]
//
//   --slugs <a> <b> ...    Song slugs to probe (URL-encoded automatically).
//   --locale <a,b>         Locales to probe (default: en only).
//   --base <url>           Production / preview base URL.
//   --wait <ms>            Gap between MISS and HIT probes (default 1500).
//   --warm                 Skip the warm-up HIT; go straight to MISS+HIT.
//
// Requires a deployed app (localhost won't show real x-nextjs-cache headers
// unless you `pnpm start` after `pnpm build`).

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const arr = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) out.push(argv[j]);
  return out.length ? out : fallback;
};

const BASE = flag("--base", argv[0] && !argv[0].startsWith("--") ? argv[0] : "").replace(/\/$/, "");
const SLUGS = arr("--slugs", []);
// Support `--locale en,ja,zh-TW` (comma-joined) and `--locale en ja zh-TW` (space).
const LOCALES = arr("--locale", ["en"]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
const WAIT_MS = Number(flag("--wait", "1500"));

if (!BASE || SLUGS.length === 0) {
  console.error("Usage: node scripts/measure-isr-live.js <base-url> --slugs <slug...> [--locale en,ja]");
  process.exit(1);
}

const KB = 1024;
const WRITE_UNIT = 8 * 1024;
const fmt = (b) => (b >= KB * KB ? `${(b / (KB * KB)).toFixed(2)} MB` : `${(b / KB).toFixed(1)} KB`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url) {
  const start = Date.now();
  const res = await fetch(url, { redirect: "manual" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    cache: res.headers.get("x-nextjs-cache"),
    cacheControl: res.headers.get("cache-control"),
    age: res.headers.get("age"),
    contentLength: Number(res.headers.get("content-length") ?? buf.length),
    bytes: buf.length,
    ms: Date.now() - start,
  };
}

function summarize(url, miss, hit) {
  const units = Math.ceil(miss.bytes / WRITE_UNIT);
  console.log(
    `  ${fmt(miss.bytes).padStart(10)}  ${String(units).padStart(4)}u  ` +
      `miss=[${miss.status} ${miss.cache ?? "-"} ${miss.ms}ms] ` +
      `hit=[${hit.status} ${hit.cache ?? "-"} ${hit.ms}ms]  ${url}`,
  );
  return units;
}

console.log(`Base: ${BASE}`);
console.log(`Slugs: ${SLUGS.join(", ")} × locales ${LOCALES.join(", ")}\n`);

let totalUnits = 0;
let totalBytes = 0;
const revalidated = [];

for (const locale of LOCALES) {
  console.log(`\u001b[1mlocale=${locale}\u001b[0m`);
  for (const slug of SLUGS) {
    const url = `${BASE}/${locale}/db/songs/${encodeURIComponent(slug)}`;
    // Warm pass first so we always measure a consistent MISS+HIT pair.
    await probe(url);
    await sleep(WAIT_MS);
    // First measured probe: typically MISS (regenerate) or REVALIDATED.
    const miss = await probe(url);
    await sleep(WAIT_MS);
    // Second probe: should be HIT.
    const hit = await probe(url);
    const units = summarize(url, miss, hit);
    totalUnits += units;
    totalBytes += miss.bytes;
    if (miss.cache === "REVALIDATED" || miss.cache === "MISS") revalidated.push(url);
  }
}

console.log("");
console.log(`\u001b[1mTotal across ${SLUGS.length * LOCALES.length} slugs:\u001b[0m ${fmt(totalBytes)}, ${totalUnits} ISR write units`);
console.log(`Cost per revalidation cycle at $0.40 / 100k units: $${((totalUnits / 100_000) * 0.4).toFixed(4)}`);
if (revalidated.length) {
  console.log(`\u001b[33m${revalidated.length} URL(s) returned REVALIDATED/MISS → these are the routes Vercel bills as ISR writes.\u001b[0m`);
} else {
  console.log(`No URL returned REVALIDATED/MISS — increase --wait or check the deploy.`);
}
