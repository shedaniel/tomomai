#!/usr/bin/env node
// Measures the on-disk ISR payload size for every prerendered /db/songs/[slug]
// route and estimates Vercel ISR write units (ceil(payload_bytes / 8KB)).
//
// Vercel bills ISR writes as the prerendered page artifact size rounded up to
// the nearest 8KB unit, charged every time the route is regenerated. By
// inspecting what `next build` writes under .next/server/app, we see the same
// payload bytes Vercel persists on each revalidation — so the per-route
// numbers below are exactly the cost lever we can pull.
//
// Usage:
//   pnpm --filter @tomomai/site build           # build first
//   node scripts/measure-isr-payload.js [--dir .next] [--top 30] [--by-locale]
//
// Notes:
// - Counts .html + .rsc + .meta for every prerendered route. The HTML and
//   RSC flight data are what Vercel stores on a revalidation; the .meta is
//   small but included for completeness.
// - og-image / sitemap / robots / api are excluded (they are not billed as
//   ISR page writes for the [slug] route).

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const getFlag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const NEXT_DIR = getFlag("--dir", ".next");
const TOP = Number(getFlag("--top", "30"));
const BY_LOCALE = argv.includes("--by-locale");

const appDir = path.join(NEXT_DIR, "server", "app");
if (!fs.existsSync(appDir)) {
  console.error(`No .next build found at ${appDir}. Run \`pnpm --filter @tomomai/site build\` first.`);
  process.exit(1);
}

const KB = 1024;
const WRITE_UNIT = 8 * 1024; // Vercel: 1 ISR write unit = 8KB

const fmt = (bytes) => {
  if (bytes >= KB * KB) return `${(bytes / (KB * KB)).toFixed(2)} MB`;
  return `${(bytes / KB).toFixed(1)} KB`;
};

// Recursively collect (file, size) pairs.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(appDir);

// Next stores prerendered routes as <route-path>.html, <route-path>.rsc, etc.
// A single logical route = the set of files sharing a base path under its
// page directory. We group by the file's directory + basename-without-ext
// (e.g. ".../db/[type]/[slug]/<slug-value>.html" and ".rsc" share a base).
const buckets = new Map(); // base -> { dir, base, exts: {html, rsc, meta, ...} }
for (const f of files) {
  const ext = path.extname(f); // .html, .rsc, .meta, .json, ...
  if (!["html", "rsc", "meta", "json"].includes(ext.slice(1))) continue;
  const dir = path.dirname(f);
  const base = path.basename(f, ext);
  const key = `${dir}::${base}`;
  if (!buckets.has(key)) buckets.set(key, { dir, base, exts: {} });
  buckets.get(key).exts[ext.slice(1)] = fs.statSync(f).size;
}

// Build per-route rows. A route is "interesting" if its path looks like a
// /db/songs/[slug] page (server app dir layout: .../db/[type]/[slug]/... or
// .../db/... ). We label each row with a human path.
const rows = [];
for (const { dir, base, exts } of buckets.values()) {
  // Skip the canonical "[type]" / "[slug]" template dirs — we want the
  // prerendered instances (real slug values, no brackets).
  const rel = path.relative(appDir, dir);
  if (rel.includes("[") || base.includes("[")) continue;
  const html = exts.html ?? 0;
  const rsc = exts.rsc ?? 0;
  const meta = exts.meta ?? 0;
  const other = Object.entries(exts)
    .filter(([k]) => !["html", "rsc", "meta"].includes(k))
    .reduce((s, [, v]) => s + v, 0);
  const total = html + rsc + meta + other;
  if (total === 0) continue;
  rows.push({
    route: rel ? `${rel}/${base}` : base,
    html, rsc, meta, other, total,
    units: Math.ceil(total / WRITE_UNIT),
  });
}

// Focus: /db/songs/[slug]. After the i18n [locale] segment, the server dir
// layout is roughly:
//   [locale]/db/[type]/[slug]/<encoded-slug>.html
// The first path part is the locale; the rest mirrors the URL.
const songRows = rows.filter((r) => /^([a-z-]+)\/db\/songs\/[^/]+$/.test(r.route));

function banner(label) {
  console.log("");
  console.log(`\u001b[1m\u001b[36m${label}\u001b[0m`);
}

function summarize(label, list) {
  if (list.length === 0) {
    console.log(`  (no routes matched)`);
    return;
  }
  const totals = list.reduce(
    (a, r) => {
      a.html += r.html; a.rsc += r.rsc; a.total += r.total; a.units += r.units;
      return a;
    },
    { html: 0, rsc: 0, total: 0, units: 0 },
  );
  const count = list.length;
  const avg = totals.total / count;
  console.log(
    `  ${label}: ${count} routes, total ${fmt(totals.total)}, avg ${fmt(avg)}, ` +
      `avg units/route ${(totals.units / count).toFixed(1)}, total units ${totals.units.toLocaleString()}`,
  );
}

// Report the per-route RSC segments Next emits alongside the page RSC. These
// are the segment blobs Vercel persists and re-persists on ISR revalidation;
// the biggest ones (e.g. [type]/layout SongsList segment) are the levers.
function segmentReport() {
  const segDirs = new Set();
  for (const f of files) {
    if (f.endsWith(".segments") || f.includes(".segments/")) {
      const segRoot = f.split(".segments")[0] + ".segments";
      segDirs.add(segRoot);
    }
  }
  const rows = [];
  for (const dir of segDirs) {
    if (!fs.existsSync(dir)) continue;
    let total = 0;
    const files2 = walk(dir);
    for (const f of files2) total += fs.statSync(f).size;
    const rel = path.relative(appDir, dir);
    rows.push({ rel, total, units: Math.ceil(total / WRITE_UNIT) });
  }
  rows.sort((a, b) => b.total - a.total);
  console.log("");
  console.log(`\u001b[1m\u001b[36mTop ${TOP} largest shared RSC segments (also billed on revalidation)\u001b[0m`);
  for (const r of rows.slice(0, TOP)) {
    console.log(`  ${fmt(r.total).padStart(11)}  ${String(r.units).padStart(4)}u  ${r.rel}`);
  }
}

banner("Overview");
summarize("All prerendered routes", rows);
summarize("/db/songs/[slug] (all locales)", songRows);

if (BY_LOCALE) {
  const byLocale = new Map();
  for (const r of songRows) {
    const locale = r.route.split("/")[0];
    if (!byLocale.has(locale)) byLocale.set(locale, []);
    byLocale.get(locale).push(r);
  }
  banner("/db/songs/[slug] by locale");
  for (const [locale, list] of [...byLocale.entries()].sort()) {
    summarize(`locale=${locale}`, list);
  }
}

segmentReport();

banner(`Top ${TOP} largest /db/songs/[slug] routes (by payload size)`);
const sorted = [...songRows].sort((a, b) => b.total - a.total).slice(0, TOP);
for (const r of sorted) {
  console.log(
    `  ${fmt(r.total).padStart(11)}  ${String(r.units).padStart(4)}u  ` +
      `html=${fmt(r.html).padStart(8)} rsc=${fmt(r.rsc).padStart(8)}  ${r.route}`,
  );
}

banner(`Top ${TOP} smallest (sanity check — should not be tiny)`);
const smallest = [...songRows].sort((a, b) => a.total - b.total).slice(0, Math.min(5, TOP));
for (const r of smallest) {
  console.log(
    `  ${fmt(r.total).padStart(11)}  ${String(r.units).padStart(4)}u  ${r.route}`,
  );
}

// Cost model: assume a regeneration cadence and report projected units/day.
banner("Cost projection (daily revalidation of every song slug, all locales)");
const perDay = songRows.length; // 1-day revalidate on /db/songs/[slug] → ~1 regen/day per route
const unitsPerDay = songRows.reduce((s, r) => s + r.units, 0);
const dollarsPerDayAt40cPer1k = (unitsPerDay / 1_000_000) * 1000 * 0.4; // $0.40 per 100k → $4 / 1M
console.log(
  `  Routes regenerating: ${perDay.toLocaleString()}/day (assuming revalidate=86400, 1 hit per stale route)`,
);
console.log(`  Units/day if each route regenerates once: ${unitsPerDay.toLocaleString()}`);
console.log(`  Projected cost/day at $0.40 per 100k units:  $${dollarsPerDayAt40cPer1k.toFixed(2)}`);
console.log(
  `  If each route regenerates N times/day, multiply by N. On-demand ISR regenerates ` +
    `on every request that lands after the page goes stale — popular slugs may regen many times.`,
);
