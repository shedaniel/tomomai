import { generateText, tool, stepCountIs, hasToolCall } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { load } from "cheerio";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { storePending } from "@/server/services/admin/pending-confirmation";
import { sendDiscordNotice } from "@/server/services/admin/discord-webhooks";
import { resolveBaseUrl } from "@tomomai/server/base-url";
import { computeEventDelta, formatEventDescription, deltaColor, norm, normType } from "@/server/services/admin/event-diff";
import { KNOWN_STEP_TYPES } from "@tomomai/catalog/event-types";

const StepSchema = z.object({
  distance: z.number(),
  type: z.string(),
  reward: z.string(),
});

const EventSchema = z.object({
  name: z.string(),
  periods: z.array(z.string()).describe("One or more date range strings, e.g. [\"2020/08/07～2021/03/17\", \"2022/09/15～2023/03/22\"]"),
  steps: z.array(StepSchema),
});

type Event = z.infer<typeof EventSchema>;

const ALLOWED_HOST = "gamerch.com";
const START_URL = "https://gamerch.com/maimai/533627";
const MAX_CONTENT_LENGTH = 40000;
const DISCOVERY_CONCURRENCY = 15;
const SCRAPE_CONCURRENCY = 30;
const MAX_BFS_DEPTH = 3;

export function extractAsMarkdown(html: string, baseUrl: string, visitedUrls: Set<string>, { includeLinks = true }: { includeLinks?: boolean } = {}): string {
  const $ = load(html);

  // Remove non-content elements
  $("script, style, nav, header, footer, .ad, .sidebar, iframe, noscript").remove();

  const container = $("div.main").first();
  if (container.length === 0) return $("body").text().slice(0, MAX_CONTENT_LENGTH);

  // Remove flavor text boxes (except on pages that use them for event data)
  if (!baseUrl.includes("gamerch.com/maimai/813771")) {
    container.find(".mu__box").remove();
  }
  // Remove comments section — large noise
  container.find("#comment, .comment, .comment-list, .comment_list, [id*='comment']").remove();
  // Remove share/social sections
  container.find(".share, .social, .sns").remove();
  // Remove "new threads" sidebar content and BBS sections
  container.find(".latestThread, [class*='latestThread'], [ref='latestThread'], .thread, [class*='thread'], [class*='Thread'], [class*='bbs']").remove();

  // Remove duplicate km column when table has both 距離[m] and 距離[Km] headers
  container.find("table").each((_, table) => {
    const $table = $(table);
    const headers = $table.find("th");
    if (headers.length >= 2) {
      const first = $(headers[0]).text();
      const second = $(headers[1]).text();
      if (/距離.*m/i.test(first) && /距離.*km/i.test(second)) {
        // Remove the second cell (index 1) from every row
        $table.find("tr").each((_, row) => {
          const cells = $(row).find("th, td");
          if (cells.length >= 2) $(cells[1]).remove();
        });
      }
    }
  });

  // Normalize the current page URL for self-link detection
  const currentUrl = new URL(baseUrl);
  currentUrl.hash = "";
  currentUrl.search = "";
  const currentHref = currentUrl.href;

  // Convert links to markdown-style inline links or plain text
  container.find("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const text = $el.text().trim();
    if (!href || !text) return;
    if (!includeLinks) {
      $el.replaceWith(text);
      return;
    }
    try {
      const resolved = new URL(href, baseUrl);
      const displayHref = resolved.href;
      // Strip hash/search for dedup checks only
      resolved.hash = "";
      resolved.search = "";
      const normalizedHref = resolved.href;
      if (resolved.hostname.endsWith(ALLOWED_HOST) && resolved.pathname.startsWith("/maimai/")) {
        // Skip links in reward table rows (a sibling <td> contains just a number = distance column)
        // and song list tables (header contains 曲名)
        const $row = $el.closest("tr");
        if ($row.length > 0) {
          const isRewardRow = $row.find("td").toArray().some((td) => /^\d+$/.test($(td).text().trim()));
          const $table = $el.closest("table");
          const isSongTable = $table.length > 0 && $table.find("th").toArray().some((th) => $(th).text().includes("曲名"));
          if (isRewardRow || isSongTable) {
            $el.replaceWith(text);
            return;
          }
        }

        // Skip same-page links and already-visited URLs
        if (normalizedHref === currentHref || visitedUrls.has(normalizedHref)) {
          $el.replaceWith(text);
        } else {
          const title = $el.attr("title");
          const titlePart = title ? ` "${title}"` : "";
          $el.replaceWith(`[${text}](${displayHref}${titlePart})`);
        }
        return;
      }
    } catch {
      // Ignore invalid URLs
    }
    $el.replaceWith(text);
  });

  const text = container.text();

  // Collapse whitespace
  return text
    .replace(/\t/g, " ")
    .replace(/[ ]+/g, " ")
    .replace(/\n[ ]*\n/g, "\n")
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

async function fetchPageHtml(url: string, visitedUrls: Set<string>, log: any): Promise<{ html: string } | { error: string }> {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(ALLOWED_HOST) || !parsed.pathname.startsWith("/maimai/")) {
      return { error: "URL not allowed. Only gamerch.com/maimai/* URLs are permitted." };
    }
  } catch {
    return { error: "Invalid URL" };
  }

  try {
    log.debug({ url }, "Fetching page");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; maimai-charts-bot/1.0)",
        "Accept": "text/html",
        "Accept-Language": "ja,en;q=0.5",
      },
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    visitedUrls.add(url);

    log.debug({ url, htmlLength: html.length }, "Page fetched");

    return { html };
  } catch (err) {
    return { error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const SCRAPER_SYSTEM = `You are a JSON extraction agent. You receive wiki page content about maimai tour events (ちほー/つあーイベント).

Your ONLY job: extract event data from the page and call submitEvents with the results.

For each event found, extract:
- name: The event name (e.g. "IOSYSちほー")
- periods: Array of date range strings (開催期間/出現期間). Some events have multiple periods, e.g. ["2020/08/07～2021/03/17", "2022/09/15～2023/03/22"]. Always return an array, even if there's only one period. If it is unclear, put ? instead, or omit, for example ["?"] or ["2022/09/15～?"]
- steps: Array of reward steps, each with:
  - distance: number
  - type: reward type (報酬の種類) e.g. "つあーメンバー", "課題曲", "ネームプレート", "フレーム", "解禁楽曲", "パーフェクトチャレンジ楽曲", "KALEIDXSCOPE"
  - reward: reward name (報酬)

Rules:
- Only include events that have a reward steps table with at least one step.
- The distance must be a number.
- If the page has no events with reward tables, call submitEvents with an empty array.
- Call submitEvents exactly once with ALL events from this page.`;

const FALLBACK_MODEL = "google/gemini-3.1-flash-lite-preview";

async function runScraper(modelId: string, content: string, url: string, log: any): Promise<Event[]> {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY! });
  const model = openrouter(modelId);
  const extractedEvents: Event[] = [];

  const result = await generateText({
    model,
    system: SCRAPER_SYSTEM,
    tools: {
      submitEvents: tool({
        description: "Submit all extracted events from this page.",
        inputSchema: z.object({
          events: z.array(EventSchema),
        }),
        execute: async ({ events }) => {
          log.debug({ url, modelId, eventCount: events.length }, "Scraper agent extracted events");
          extractedEvents.push(...events);
          return { received: events.length };
        },
      }),
    },
    stopWhen: [stepCountIs(3), hasToolCall("submitEvents")],
    prompt: `Extract all maimai tour event data from this page (${url}):\n\n${content}`,
  });

  if (extractedEvents.length === 0) {
    log.warn({ url, modelId, response: result.text }, "Scraper agent found no events");
  }

  return extractedEvents;
}

async function scrapePageForEvents(content: string, url: string, log: any): Promise<Event[]> {
  const primaryModel = process.env.AI_MODEL || "anthropic/claude-sonnet-4-5-20250514";

  log.debug({ url, contentLength: content.length }, "Starting scraper agent");

  try {
    const events = await runScraper(primaryModel, content, url, log);
    if (events.length > 0 || primaryModel === FALLBACK_MODEL) return events;

    log.info({ url }, "Retrying with fallback model");
    return await runScraper(FALLBACK_MODEL, content, url, log);
  } catch (err) {
    log.error({
      url,
      error: err instanceof Error
        ? { message: err.message, name: err.name }
        : String(err),
    }, "Scraper agent failed");
    return [];
  }
}

/** Extract all markdown links from content, normalize and deduplicate */
export function extractLinks(content: string, alreadyVisited: Set<string>): string[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+?)(?:\s+"[^"]*")?\)/g;
  const seen = new Set<string>();
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    try {
      const u = new URL(match[2]);
      u.hash = "";
      u.search = "";
      const normalized = u.href;
      if (
        normalized.startsWith("https://gamerch.com/maimai/") &&
        !normalized.includes("/author/") &&
        !normalized.includes("/maimai/jump") &&
        !normalized.includes("/maimai/tag/") &&
        !alreadyVisited.has(normalized) &&
        !seen.has(normalized)
      ) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // Skip invalid URLs
    }
  }
  return links;
}

/** Use AI to determine whether a page should be scraped for event data */
async function shouldScrapePage(content: string, url: string, log: any): Promise<boolean> {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY! });
  const model = openrouter(process.env.AI_MODEL || "anthropic/claude-sonnet-4-5-20250514");

  let shouldScrape = false;

  try {
    await generateText({
      model,
      system: `You are an analysis agent for a maimai wiki crawler.

You receive the text content of a page. Your ONLY job is to determine whether this page contains event reward tables.

A page should be scraped if it contains event reward tables with columns like 距離[km], 報酬の種類, 報酬 — or inline event data with distance/reward pairs.

Call submitDecision exactly once.`,
      tools: {
        submitDecision: tool({
          description: "Submit whether this page should be scraped for event data.",
          inputSchema: z.object({
            shouldScrape: z.boolean().describe("Whether this page contains event reward tables"),
          }),
          execute: async ({ shouldScrape: s }) => {
            shouldScrape = s;
            return { received: true };
          },
        }),
      },
      stopWhen: stepCountIs(2),
      prompt: `Does this page (${url}) contain event reward tables?\n\n${content}`,
      providerOptions: {
        gateway: {
          caching: "auto",
        },
      },
    });

    log.debug({ url, shouldScrape }, "Scrape decision");
  } catch (err) {
    log.error(
      { url, error: err instanceof Error ? err.message : String(err) },
      "Scrape decision agent failed",
    );
  }

  return shouldScrape;
}

export async function discoverLinks(
  content: string,
  url: string,
  alreadyVisited: Set<string>,
  log: any,
): Promise<{ url: string; links: string[]; shouldScrape: boolean }> {
  // Links are extracted programmatically — no AI needed
  const links = extractLinks(content, alreadyVisited);

  // AI only decides whether this page itself should be scraped
  const shouldScrape = await shouldScrapePage(content, url, log);

  log.debug(
    { url, linksFound: links, shouldScrape },
    "Discovery result",
  );

  return { url, links, shouldScrape };
}

export async function POST(request: NextRequest) {
  try {
    // Auth - same pattern as other admin routes
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 },
      );
    }

    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 },
      );
    }

    const requestId = nanoid(10);
    const log = logger.child({ route: "admin/fetch_events", requestId });

    log.info("Starting event scraping");

    const collectedEvents: Event[] = [];
    const visited = new Set<string>();
    const pageHtmlCache = new Map<string, string>();
    let pagesToScrape: string[] = [];
    let pagesVisited = 0;

    const SCRAPE_CACHE_KEY = "admin:events:pagesToScrape";
    const SCRAPE_CACHE_TTL = 12 * 60 * 60; // 12 hours

    // Check Redis cache for previously discovered pages
    const cached = await redis.get(SCRAPE_CACHE_KEY);
    if (cached) {
      pagesToScrape = JSON.parse(cached);
      log.info({ pagesToScrape: pagesToScrape.length }, "Using cached pagesToScrape from Redis");
    } else {
      // Phase 1: BFS Link Discovery
      const queue: string[] = [START_URL];

      let bfsLevel = 0;
      while (queue.length > 0 && bfsLevel < MAX_BFS_DEPTH) {
        bfsLevel++;
        log.debug({ bfsLevel, queueSize: queue.length, urls: queue }, "BFS wave start");

        // Fetch all queued pages in parallel
        const fetchResults = await Promise.all(
          queue.map(async (url) => {
            visited.add(url);
            const result = await fetchPageHtml(url, visited, log);
            if ("html" in result) {
              pageHtmlCache.set(url, result.html);
              pagesVisited++;
              const content = extractAsMarkdown(result.html, url, visited);
              return { url, content };
            }
            log.error({ url, error: result.error }, "Failed to fetch during discovery");
            return null;
          }),
        );

        const fetched = fetchResults.filter(
          (r): r is { url: string; content: string } => r !== null,
        );

        // Run discovery agents in parallel (batched by DISCOVERY_CONCURRENCY)
        const nextQueue: string[] = [];
        for (let i = 0; i < fetched.length; i += DISCOVERY_CONCURRENCY) {
          const batch = fetched.slice(i, i + DISCOVERY_CONCURRENCY);
          const discoveries = await Promise.all(
            batch.map(({ url, content }) => discoverLinks(content, url, visited, log)),
          );
          for (const disc of discoveries) {
            if (disc.shouldScrape && !pagesToScrape.includes(disc.url)) {
              pagesToScrape.push(disc.url);
            }
            // Only follow links from pages that contain event data
            if (disc.shouldScrape) {
              for (const link of disc.links) {
                if (!visited.has(link) && !nextQueue.includes(link) && !queue.includes(link)) {
                  nextQueue.push(link);
                }
              }
            }
          }
        }

        log.info(
          { bfsLevel, newLinks: nextQueue.length, pagesToScrape: pagesToScrape.length },
          "BFS wave complete",
        );

        queue.length = 0;
        queue.push(...nextQueue);
      }

      // Cache discovered pages in Redis
      await redis.set(SCRAPE_CACHE_KEY, JSON.stringify(pagesToScrape), "EX", SCRAPE_CACHE_TTL);
      log.info({ pagesToScrape: pagesToScrape.length }, "Cached pagesToScrape in Redis (12h TTL)");
    }

    // Phase 2: Run scraper agents in parallel (batches of 5)
    log.info({ pagesToScrape: pagesToScrape.length }, "Starting parallel scraping phase");

    for (let i = 0; i < pagesToScrape.length; i += SCRAPE_CONCURRENCY) {
      const batch = pagesToScrape.slice(i, i + SCRAPE_CONCURRENCY);
      log.info({ batch, batchIndex: Math.floor(i / SCRAPE_CONCURRENCY) + 1 }, "Starting scrape batch");

      const results = await Promise.all(
        batch.map(async (url) => {
          let html = pageHtmlCache.get(url);
          if (!html) {
            const result = await fetchPageHtml(url, visited, log);
            if ("error" in result) {
              log.error({ url, error: result.error }, "Failed to fetch page for scraping");
              return [];
            }
            html = result.html;
            pagesVisited++;
          }
          const content = extractAsMarkdown(html, url, visited, { includeLinks: false });
          return scrapePageForEvents(content, url, log);
        }),
      );

      for (const events of results) {
        collectedEvents.push(...events);
      }
    }

    // Deduplicate events with the same name (after trimming),
    // keeping the one with more steps and merging distinct periods
    const eventMap = new Map<string, Event>();
    for (const event of collectedEvents) {
      const key = norm(event.name);
      const existing = eventMap.get(key);
      if (!existing) {
        eventMap.set(key, { ...event, name: key });
      } else {
        const mergedPeriods = Array.from(new Set([...existing.periods, ...event.periods]));
        const best = event.steps.length > existing.steps.length ? event : existing;
        eventMap.set(key, { ...best, name: key, periods: mergedPeriods });
      }
    }
    const deduplicatedEvents = Array.from(eventMap.values())
      .filter((e) => !(e.steps.length === 1 && ["楽曲", "パーフェクトチャレンジ楽曲"].includes(normType(e.steps[0].type))))
      .filter((e) => !e.steps.every((s) => s.distance === 0));

    // Parse periods into structured date ranges
    const dateOrQ = `(?:\\d{4}\\/\\d{1,2}\\/\\d{1,2}|\\?+)`;
    const periodRegex = new RegExp(`^(${dateOrQ})?\\s*[～~〜-]\\s*(${dateOrQ})?$`);
    const fallbackRegex = new RegExp(`^(${dateOrQ})(まで|から)$`);
    const normalizeDate = (d: string): string | null => {
      if (/\?/.test(d)) return null;
      return d.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, (_, y, m, d) =>
        `${y}/${m.padStart(2, "0")}/${d.padStart(2, "0")}`);
    };
    const parsedEvents = deduplicatedEvents.map((event) => {
      // Determine if this event's distances need *1000 (meters from AI)
      const floatingSteps = event.steps.filter((s) => s.distance % 1.0 > 0.001).length;
      const multiplyAll = floatingSteps >= 3 || floatingSteps >= event.steps.length / 2;
      const periods = event.periods
        .filter((p) => !p.endsWith("km"))
        .filter((p) => !/^\?+$/.test(p.trim()));
      const parsedPeriods: { start: string | null; end: string | null }[] = [];
      for (const p of periods) {
        const trimmed = p.trim();
        const match = periodRegex.exec(trimmed);
        if (match) {
          parsedPeriods.push({
            start: match[1] ? normalizeDate(match[1]) : null,
            end: match[2] ? normalizeDate(match[2]) : null,
          });
          continue;
        }
        const fallback = fallbackRegex.exec(trimmed);
        if (fallback) {
          const date = normalizeDate(fallback[1]);
          parsedPeriods.push({
            start: fallback[2] === "から" ? date : null,
            end: fallback[2] === "まで" ? date : null,
          });
          continue;
        }
        console.warn(`Period does not match expected format for event "${event.name}": "${p}"`);
      }
      // Merge complementary partial periods (start-only + end-only) if end > start,
      // then remove remaining partials subsumed by a more complete period
      const merged = [...parsedPeriods];
      const consumed = new Set<number>();
      for (let i = 0; i < merged.length; i++) {
        if (consumed.has(i)) continue;
        const a = merged[i];
        if (a.start !== null && a.end !== null) continue;
        for (let j = i + 1; j < merged.length; j++) {
          if (consumed.has(j)) continue;
          const b = merged[j];
          // One has start, other has end
          const s = a.start ?? b.start;
          const e = a.end ?? b.end;
          if (s && e && ((a.start && !a.end && !b.start && b.end) || (!a.start && a.end && b.start && !b.end))) {
            if (e >= s) {
              merged[i] = { start: s, end: e };
              consumed.add(j);
              break;
            }
          }
        }
      }
      const dedupedPeriods = merged.filter((p, i) => {
        if (consumed.has(i)) return false;
        if (p.start !== null && p.end !== null) return true;
        return !merged.some((other, j) => {
          if (i === j || consumed.has(j)) return false;
          if (p.start === null && p.end !== null) {
            return other.end === p.end && other.start !== null;
          }
          if (p.start !== null && p.end === null) {
            return other.start === p.start && other.end !== null;
          }
          return false;
        });
      });
      return {
        ...event,
        periods: dedupedPeriods,
        steps: event.steps.map((s) => {
          const type = normType(s.type);
          if (!KNOWN_STEP_TYPES.has(type)) {
            console.warn(`Unknown step type for event "${event.name}": "${type}"`);
          }
          const multiply = multiplyAll || s.distance % 1.0 > 0.001;
          const distance = multiply ? Math.round(s.distance * 1000) : Math.round(s.distance);
          return { ...s, distance, type, reward: norm(s.reward) };
        }),
      };
    });
    parsedEvents.sort((a, b) => a.name.localeCompare(b.name));

    log.info({
      events: parsedEvents.length,
      duplicatesRemoved: collectedEvents.length - deduplicatedEvents.length,
      pagesVisited,
      pagesScraped: pagesToScrape.length,
    }, "Event scraping complete");

    // Compute delta against current DB
    const delta = await computeEventDelta(parsedEvents);
    const changeDescription = formatEventDescription(delta);

    // Store events + description in Redis for pending confirmation
    const pendingId = await storePending("events", {
      events: parsedEvents,
      description: changeDescription,
    });
    const baseUrl = resolveBaseUrl();
    const confirmUrl = `${baseUrl}/api/admin/events/confirm/${pendingId}`;
    const descriptionUrl = `${baseUrl}/api/admin/events/description/${pendingId}`;

    // Send Discord notification (confirm link at top)
    const discordDescription = `[Confirm](${confirmUrl}) | [Full description](${descriptionUrl})\n\n${changeDescription}`;
    sendDiscordNotice("jp", "Tour Events Update", discordDescription, deltaColor(delta)).catch((err) => {
      log.error(err, "Failed to send Discord notification");
    });

    return NextResponse.json({
      success: true,
      pendingId,
      confirmUrl,
      descriptionUrl,
      delta: {
        added: delta.added.length,
        removed: delta.removed.length,
        modified: delta.modified.length,
      },
      events: parsedEvents,
      metadata: {
        pagesVisited,
        pagesScraped: pagesToScrape.length,
      },
    });
  } catch (error) {
    console.error("Error in admin fetch_events route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
