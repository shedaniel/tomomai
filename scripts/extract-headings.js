#!/usr/bin/env node
// SEO audit tool — headings, meta, OG/Twitter, JSON-LD, hreflang, images, text.
// Usage: node scripts/extract-headings.js [--text] <url> [url2] ...
//   --text   Also extract visible text and form element values (what Google reads)

const args = process.argv.slice(2);
const showText = args.includes("--text");
const urls = args.filter(a => !a.startsWith("--"));
if (urls.length === 0) {
  console.error("Usage: node scripts/extract-headings.js [--text] <url> [url2] ...");
  process.exit(1);
}

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const bold = (s) => `${c.bold}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;
const red = (s) => `${c.red}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const green = (s) => `${c.green}${s}${c.reset}`;
const cyan = (s) => `${c.cyan}${s}${c.reset}`;
const gray = (s) => `${c.gray}${s}${c.reset}`;

function section(title) {
  console.log(`\n${bold(cyan("▸ " + title))}`);
}

function row(label, value, hint) {
  const pad = 18;
  const l = label.padEnd(pad);
  const v = value ?? dim("(missing)");
  const h = hint ? `  ${gray(hint)}` : "";
  console.log(`  ${gray(l)} ${v}${h}`);
}

function warn(msg) { console.log(`  ${yellow("⚠")}  ${msg}`); }
function ok(msg) { console.log(`  ${green("✓")}  ${msg}`); }
function err(msg) { console.log(`  ${red("✗")}  ${msg}`); }
function info(msg) { console.log(`  ${gray("·")}  ${msg}`); }

// ── HTML extraction helpers ───────────────────────────────────────────────────
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function attr(tagHtml, name) {
  const re = new RegExp(`\\b${name}=(?:"([^"]*?)"|'([^']*?)'|([^\\s>]+))`, "i");
  const m = tagHtml.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function metaContent(html, property) {
  // Matches both name= and property= meta tags
  const re = new RegExp(
    `<meta[^>]+(?:(?:name|property)=["']${property}["'][^>]+content=["']([^"']*?)["']|content=["']([^"']*?)["'][^>]+(?:name|property)=["']${property}["'])[^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function linkHref(html, rel) {
  const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["'][^>]*>`, "i");
  const m = html.match(re);
  if (m) return m[1];
  // also try href before rel
  const re2 = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["'][^>]*>`, "i");
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

// ── Extractors ────────────────────────────────────────────────────────────────
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]) : null;
}

function extractHeadings(html) {
  const headings = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({
      level: parseInt(m[1][1]),
      tag: m[1].toLowerCase(),
      text: stripTags(m[2]),
    });
  }
  return headings;
}

function extractMeta(html) {
  return {
    title: extractTitle(html),
    description: metaContent(html, "description"),
    robots: metaContent(html, "robots"),
    canonical: linkHref(html, "canonical"),
  };
}

function extractOG(html) {
  const keys = ["og:title", "og:description", "og:image", "og:url", "og:type", "og:site_name"];
  const out = {};
  for (const k of keys) out[k] = metaContent(html, k);
  return out;
}

function extractTwitter(html) {
  const keys = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];
  const out = {};
  for (const k of keys) out[k] = metaContent(html, k);
  return out;
}

function extractHreflang(html) {
  const links = [];
  const re = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const hreflang = attr(tag, "hreflang");
    const href = attr(tag, "href");
    if (hreflang && href) links.push({ hreflang, href });
  }
  return links;
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1].trim())); }
    catch { blocks.push({ _parseError: m[1].trim().slice(0, 80) }); }
  }
  return blocks;
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  const base = (() => { try { return new URL(baseUrl).origin; } catch { return ""; } })();
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const href = attr(tag, "href") ?? "";
    const text = stripTags(m[2]).slice(0, 80);
    const rel = attr(tag, "rel") ?? "";
    const isExternal = href.startsWith("http") && base && !href.startsWith(base);
    const isInternal = href.startsWith("/") || (base && href.startsWith(base));
    if (!href || href.startsWith("#") || href.startsWith("javascript")) continue;
    links.push({ href, text, rel, isExternal, isInternal });
  }
  return links;
}

function extractImages(html) {
  const images = [];
  const re = /<img([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const src = attr(tag, "src") ?? attr(tag, "data-src");
    const alt = attr(tag, "alt");
    images.push({ src, alt });
  }
  return images;
}

function extractSelects(html) {
  const groups = [];

  // Native <select>/<option>
  const reSelect = /<select([^>]*)>([\s\S]*?)<\/select>/gi;
  let ms;
  while ((ms = reSelect.exec(html)) !== null) {
    const name = attr(ms[1], "name") ?? attr(ms[1], "id") ?? attr(ms[1], "aria-label") ?? "(unnamed)";
    const options = [];
    const reOpt = /<option([^>]*)>([\s\S]*?)<\/option>/gi;
    let mo;
    while ((mo = reOpt.exec(ms[2])) !== null) {
      options.push({ value: attr(mo[1], "value") ?? "", text: stripTags(mo[2]) });
    }
    if (options.length > 0) groups.push({ kind: "select", name, options });
  }

  // Radix UI / ARIA listboxes: role="listbox" containers with role="option" children
  const reListbox = /role=["']listbox["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi;
  let ml;
  while ((ml = reListbox.exec(html)) !== null) {
    const options = [];
    const reOpt = /role=["']option["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi;
    let mo;
    while ((mo = reOpt.exec(ml[1])) !== null) {
      options.push({ value: "", text: stripTags(mo[1]) });
    }
    if (options.length > 0) groups.push({ kind: "listbox", name: "(aria listbox)", options });
  }

  // Standalone role="option" not inside a listbox (e.g. combobox patterns)
  if (groups.filter(g => g.kind === "listbox").length === 0) {
    const options = [];
    const reOpt = /role=["']option["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi;
    let mo;
    while ((mo = reOpt.exec(html)) !== null) {
      const text = stripTags(mo[1]);
      if (text) options.push({ value: "", text });
    }
    if (options.length > 0) groups.push({ kind: "role=option", name: "(loose options)", options });
  }

  return groups;
}

function stripNoSnippet(html) {
  // Walk the HTML string and drop any element (plus all its descendants) that
  // carries data-nosnippet. We track tag depth manually so nested tags work.
  let out = "";
  let i = 0;
  let skipTag = null;   // tag name we're skipping inside
  let skipDepth = 0;    // nesting depth inside a skipped block

  while (i < html.length) {
    if (html[i] !== "<") { if (!skipTag) out += html[i]; i++; continue; }

    // Find end of this tag
    let j = html.indexOf(">", i);
    if (j === -1) { if (!skipTag) out += html.slice(i); break; }
    const tag = html.slice(i, j + 1);
    i = j + 1;

    const closeMatch = tag.match(/^<\/([a-z][a-z0-9]*)/i);
    const openMatch = tag.match(/^<([a-z][a-z0-9]*)/i);
    const selfClose = tag.endsWith("/>") || /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(tag);

    if (skipTag) {
      if (closeMatch && closeMatch[1].toLowerCase() === skipTag) {
        skipDepth--;
        if (skipDepth === 0) skipTag = null;
      } else if (openMatch && !selfClose && openMatch[1].toLowerCase() === skipTag) {
        skipDepth++;
      }
    } else {
      if (openMatch && /\bdata-nosnippet\b/i.test(tag) && !selfClose) {
        skipTag = openMatch[1].toLowerCase();
        skipDepth = 1;
      } else {
        out += tag;
      }
    }
  }
  return out;
}

function extractVisibleText(html) {
  // Remove blocks that are never visible to users/crawlers
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove option/select values (covered separately)
    .replace(/<select[\s\S]*?<\/select>/gi, "");

  // Strip data-nosnippet elements (mirrors Google's behaviour)
  text = stripNoSnippet(text);

  text = text
    // Collapse tags into whitespace
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

// ── Renderers ─────────────────────────────────────────────────────────────────
function renderMeta(meta, og, twitter) {
  section("Meta");
  row("title", meta.title ? `"${meta.title}"` : null, meta.title ? `${meta.title.length} chars` : "");
  row("description", meta.description ? `"${meta.description}"` : null, meta.description ? `${meta.description.length} chars` : "");
  row("canonical", meta.canonical ?? null);
  row("robots", meta.robots ?? null);

  if (!meta.title) err("Missing <title>");
  if (!meta.description) warn("Missing meta description");
  if (!meta.canonical) warn("No canonical link");
  if (meta.title && meta.title.length > 60) warn(`Title is ${meta.title.length} chars (recommended ≤60)`);
  if (meta.description && meta.description.length > 160) warn(`Description is ${meta.description.length} chars (recommended ≤160)`);

  section("Open Graph");
  for (const [k, v] of Object.entries(og)) row(k, v ? `"${v}"` : null);
  if (!og["og:image"]) warn("Missing og:image");
  if (og["og:title"] && meta.title && og["og:title"] !== meta.title) warn("og:title differs from <title>");

  section("Twitter Card");
  for (const [k, v] of Object.entries(twitter)) row(k, v ? `"${v}"` : null);
  if (!twitter["twitter:card"]) warn("Missing twitter:card");
}

function renderHeadings(headings) {
  section("Headings");
  if (headings.length === 0) { warn("No headings found"); return; }
  for (const { tag, text, level } of headings) {
    const indent = "  ".repeat(level - 1);
    console.log(`  ${indent}${gray("<" + tag + ">")} ${text || dim("(empty)")}`);
  }
  const counts = {};
  for (const { tag } of headings) counts[tag] = (counts[tag] ?? 0) + 1;
  console.log(`  ${gray("─".repeat(40))}`);
  console.log(`  Total: ${headings.length}  |  ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  if (!counts.h1) err("No <h1> found");
  if ((counts.h1 ?? 0) > 1) warn(`Multiple <h1> tags (${counts.h1})`);
}

function renderHreflang(links) {
  section("Hreflang");
  if (links.length === 0) { info("No hreflang links"); return; }
  for (const { hreflang, href } of links) row(hreflang, href);
  ok(`${links.length} hreflang link(s)`);
  const hasXDefault = links.some(l => l.hreflang === "x-default");
  if (!hasXDefault) warn("No x-default hreflang");
}

function renderJsonLd(blocks) {
  section("JSON-LD");
  if (blocks.length === 0) { info("No JSON-LD found"); return; }
  for (const block of blocks) {
    if (block._parseError) { err(`Parse error: ${block._parseError}`); continue; }
    const type = Array.isArray(block["@type"]) ? block["@type"].join(", ") : block["@type"] ?? "?";
    console.log(`  ${green("✓")}  ${bold(type)}`);
    // Show a few key fields depending on type
    const preview = ["name", "url", "description", "image", "numberOfItems", "headline"];
    for (const k of preview) {
      if (block[k] !== undefined) {
        const v = typeof block[k] === "string" ? block[k].slice(0, 80) : JSON.stringify(block[k]).slice(0, 80);
        console.log(`     ${gray(k.padEnd(16))} ${v}`);
      }
    }
    if (block.itemListElement?.length) info(`itemListElement: ${block.itemListElement.length} items`);
    if (block.breadcrumb || block["@type"] === "BreadcrumbList") {
      const items = block.itemListElement ?? [];
      info(`Breadcrumb: ${items.map(i => i.item?.name ?? i.name ?? "?").join(" › ")}`);
    }
  }
}

function renderImages(images) {
  section("Images");
  if (images.length === 0) { info("No <img> tags"); return; }
  const missingAlt = images.filter(i => i.alt === null || i.alt === undefined);
  const emptyAlt = images.filter(i => i.alt === "");
  ok(`${images.length} image(s) found`);
  if (emptyAlt.length) info(`${emptyAlt.length} with empty alt="" (decorative — OK if intentional)`);
  if (missingAlt.length) {
    err(`${missingAlt.length} image(s) missing alt attribute:`);
    for (const img of missingAlt.slice(0, 5)) {
      console.log(`     ${gray((img.src ?? "(no src)").slice(0, 80))}`);
    }
    if (missingAlt.length > 5) info(`  ...and ${missingAlt.length - 5} more`);
  } else {
    ok("All images have alt attributes");
  }
}

function renderLinks(links, _url) {
  section("Links");
  if (links.length === 0) { info("No links found"); return; }

  const internal = links.filter(l => l.isInternal);
  const external = links.filter(l => l.isExternal);
  const nofollow = links.filter(l => l.rel.includes("nofollow"));
  const noText = links.filter(l => !l.text.trim());

  ok(`${links.length} total  —  ${internal.length} internal  ${external.length} external`);
  if (nofollow.length) info(`${nofollow.length} nofollow`);
  if (noText.length) warn(`${noText.length} link(s) with no anchor text`);

  if (external.length > 0) {
    console.log(`\n  ${bold("External:")}`);
    for (const { href, text, rel } of external) {
      const flags = rel ? gray(`  [${rel}]`) : "";
      console.log(`    ${gray("→")} ${text || dim("(no text)")}  ${gray(href.slice(0, 80))}${flags}`);
    }
  }

  if (internal.length > 0) {
    console.log(`\n  ${bold("Internal:")}`);
    // Deduplicate by href, keep first anchor text seen
    const seen = new Map();
    for (const { href, text, rel } of internal) {
      if (!seen.has(href)) seen.set(href, { text, rel });
    }
    for (const [href, { text, rel }] of seen) {
      const flags = rel ? gray(`  [${rel}]`) : "";
      console.log(`    ${gray("·")} ${text || dim("(no text)")}  ${gray(href.slice(0, 80))}${flags}`);
    }
    if (internal.length > seen.size) info(`(${internal.length - seen.size} duplicate internal hrefs collapsed)`);
  }
}

function renderSelects(selects) {
  section("Form Elements (select/option)");
  if (selects.length === 0) { info("No <select> elements"); return; }
  for (const { name, options } of selects) {
    console.log(`  ${gray("select")} ${bold(name)}  ${gray(`(${options.length} options)`)}`);
    for (const { value, text } of options.slice(0, 20)) {
      const display = text || value || dim("(empty)");
      console.log(`    ${gray("·")} ${display}${value && value !== text ? gray("  val=" + value) : ""}`);
    }
    if (options.length > 20) info(`    ...and ${options.length - 20} more options`);
  }
}

function renderVisibleText(text) {
  section("Visible Text (what crawlers read)");
  const words = text.split(/\s+/).filter(Boolean);
  console.log(`  ${gray("word count:")} ${words.length}`);
  console.log(`  ${gray("chars:")}      ${text.length}`);
  console.log();
  // Print in 120-char wrapped lines, up to 1200 chars, then truncate
  const preview = text.slice(0, 1200);
  const lines = [];
  let i = 0;
  while (i < preview.length) {
    lines.push(preview.slice(i, i + 120));
    i += 120;
  }
  for (const line of lines) console.log(`  ${line}`);
  if (text.length > 1200) info(`  ... (${text.length - 600} more chars)`);
}

// ── Robots + Sitemap ─────────────────────────────────────────────────────────

function normalizeUrl(u) {
  try {
    const p = new URL(u);
    // Strip trailing slash (except bare origin), strip default ports, lowercase host
    let path = p.pathname.replace(/\/$/, "") || "/";
    return `${p.protocol}//${p.host}${path}${p.search}`;
  } catch { return u; }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-audit/1.0)" },
    });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

async function fetchRobots(origin) {
  const text = await fetchText(`${origin}/robots.txt`);
  if (!text) return { disallowRules: [], sitemapUrls: [], raw: null };

  const disallowRules = [];
  const sitemapUrls = [];
  let currentAgents = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();

    if (key === "user-agent")   currentAgents = [value];
    if (key === "disallow")     disallowRules.push({ agents: [...currentAgents], path: value });
    if (key === "sitemap")      sitemapUrls.push(value);
  }
  return { disallowRules, sitemapUrls, raw: text };
}

function isDisallowed(path, rules) {
  // Only consider rules for * or the specific bot
  for (const { agents, path: rule } of rules) {
    if (!agents.some(a => a === "*" || a.toLowerCase().includes("googlebot"))) continue;
    if (!rule) continue;
    if (path.startsWith(rule)) return rule;
  }
  return null;
}

async function fetchSitemapUrls(sitemapUrl, depth = 0) {
  if (depth > 2) return new Set();
  const text = await fetchText(sitemapUrl);
  if (!text) return new Set();

  const urls = new Set();

  // Sitemap index — recurse into sub-sitemaps (one level)
  const indexRe = /<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gi;
  let m;
  const subSitemaps = [];
  while ((m = indexRe.exec(text)) !== null) subSitemaps.push(m[1].trim());

  if (subSitemaps.length > 0) {
    // Fetch sub-sitemaps in parallel, cap at 10
    const results = await Promise.all(subSitemaps.slice(0, 10).map(u => fetchSitemapUrls(u, depth + 1)));
    for (const set of results) for (const u of set) urls.add(u);
    return urls;
  }

  // Regular sitemap
  const locRe = /<loc>([\s\S]*?)<\/loc>/gi;
  while ((m = locRe.exec(text)) !== null) urls.add(normalizeUrl(m[1].trim()));
  return urls;
}

async function fetchCrawlData(origin) {
  const robots = await fetchRobots(origin);
  // Discover sitemap: prefer robots.txt Sitemap: directive, fall back to /sitemap.xml
  const sitemapSources = robots.sitemapUrls.length > 0
    ? robots.sitemapUrls
    : [`${origin}/sitemap.xml`];
  const sets = await Promise.all(sitemapSources.map(u => fetchSitemapUrls(u)));
  const sitemapUrls = new Set();
  for (const s of sets) for (const u of s) sitemapUrls.add(u);
  return { robots, sitemapUrls };
}

function renderCrawlability(url, internalLinks, robots, sitemapUrls) {
  section("Robots & Sitemap");

  const { pathname } = new URL(url);
  const origin = new URL(url).origin;

  // ── Robots ──
  const disallowedBy = isDisallowed(pathname, robots.disallowRules);
  if (robots.raw === null) {
    warn("Could not fetch robots.txt");
  } else if (disallowedBy) {
    err(`Disallowed by robots.txt  ${gray("(rule: Disallow: " + disallowedBy + ")")}`);
  } else {
    ok(`Allowed by robots.txt`);
  }
  if (robots.sitemapUrls.length > 0) {
    info(`Sitemap declared in robots.txt: ${robots.sitemapUrls.join(", ")}`);
  }

  // ── Sitemap ──
  if (sitemapUrls.size === 0) {
    warn("Sitemap empty or unreachable");
  } else {
    info(`Sitemap contains ${sitemapUrls.size} URL(s)`);
    const normalized = normalizeUrl(url);
    if (sitemapUrls.has(normalized)) {
      ok(`This URL is in the sitemap`);
    } else {
      warn(`This URL is NOT in the sitemap  ${gray(normalized)}`);
    }
  }

  // ── Internal links vs sitemap ──
  if (internalLinks.length > 0 && sitemapUrls.size > 0) {
    const seen = new Map();
    for (const { href, text } of internalLinks) {
      const abs = href.startsWith("/") ? `${origin}${href}` : href;
      const norm = normalizeUrl(abs);
      if (!seen.has(norm)) seen.set(norm, text || href);
    }

    const inSitemap    = [...seen.entries()].filter(([u]) =>  sitemapUrls.has(u));
    const notInSitemap = [...seen.entries()].filter(([u]) => !sitemapUrls.has(u));

    console.log(`\n  ${bold("Internal links vs sitemap:")}  ${green(inSitemap.length + " indexed")}  ${notInSitemap.length > 0 ? yellow(notInSitemap.length + " missing") : ""}`);
    if (notInSitemap.length > 0) {
      for (const [u, text] of notInSitemap) {
        const disallowed = isDisallowed(new URL(u).pathname, robots.disallowRules);
        const flag = disallowed ? red("  [disallowed]") : yellow("  [not in sitemap]");
        console.log(`    ${gray("·")} ${text.slice(0, 40).padEnd(42)} ${gray(u.replace(origin, "").slice(0, 60))}${flag}`);
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Pre-fetch robots + sitemap once per unique origin
const crawlCache = new Map();
async function getCrawlData(url) {
  const origin = new URL(url).origin;
  if (!crawlCache.has(origin)) {
    crawlCache.set(origin, fetchCrawlData(origin));
  }
  return crawlCache.get(origin);
}

for (const url of urls) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`${bold(url)}`);
  console.log("═".repeat(70));

  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-audit/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    html = await res.text();
  } catch (e) {
    err(`Fetch failed: ${e.message}`);
    continue;
  }

  const links = extractLinks(html, url);
  const { robots, sitemapUrls } = await getCrawlData(url);

  renderMeta(extractMeta(html), extractOG(html), extractTwitter(html));
  renderHeadings(extractHeadings(html));
  renderHreflang(extractHreflang(html));
  renderJsonLd(extractJsonLd(html));
  renderImages(extractImages(html));
  renderLinks(links);
  renderCrawlability(url, links.filter(l => l.isInternal), robots, sitemapUrls);
  if (showText) {
    renderSelects(extractSelects(html));
    renderVisibleText(extractVisibleText(html));
  }
}
