import { generateText, streamText, tool, stepCountIs, gateway } from "ai";
import { load } from "cheerio";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { logger } from "@/lib/logger";

const StepSchema = z.object({
  distance: z.number(),
  type: z.string(),
  reward: z.string(),
});

const EventSchema = z.object({
  name: z.string(),
  period: z.string(),
  steps: z.array(StepSchema),
});

type Event = z.infer<typeof EventSchema>;

const ALLOWED_HOST = "gamerch.com";
const START_URL = "https://gamerch.com/maimai/533627";
const MAX_CONTENT_LENGTH = 40000;

function extractAsMarkdown(html: string, baseUrl: string, visitedUrls: Set<string>): string {
  const $ = load(html);

  // Remove non-content elements
  $("script, style, nav, header, footer, .ad, .sidebar, iframe, noscript").remove();

  const container = $("div.main").first();
  if (container.length === 0) return $("body").text().slice(0, MAX_CONTENT_LENGTH);

  // Remove comments section — large noise
  container.find("#comment, .comment, .comment-list, .comment_list, [id*='comment']").remove();
  // Remove share/social sections
  container.find(".share, .social, .sns").remove();
  // Remove "new threads" sidebar content
  container.find(".latestThread, [class*='latestThread'], [ref='latestThread'], .thread, [class*='thread'], [class*='Thread']").remove();

  // Normalize the current page URL for self-link detection
  const currentUrl = new URL(baseUrl);
  currentUrl.hash = "";
  currentUrl.search = "";
  const currentHref = currentUrl.href;

  // Convert links to markdown-style inline links, filtering out already-visited and same-page URLs
  container.find("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const text = $el.text().trim();
    if (!href || !text) return;
    try {
      const resolved = new URL(href, baseUrl);
      resolved.hash = "";
      if (resolved.hostname.endsWith(ALLOWED_HOST) && resolved.pathname.startsWith("/maimai/")) {
        // Skip same-page links (anchor links to sections on current page)
        const resolvedClean = new URL(resolved.href);
        resolvedClean.search = "";
        if (resolvedClean.href === currentHref || visitedUrls.has(resolved.href)) {
          $el.replaceWith(text);
        } else {
          $el.replaceWith(`[${text}](${resolved.href})`);
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

async function fetchPageContent(url: string, visitedUrls: Set<string>, log: any): Promise<{ content: string } | { error: string }> {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(ALLOWED_HOST) || !parsed.pathname.startsWith("/maimai/")) {
      return { error: "URL not allowed. Only gamerch.com/maimai/* URLs are permitted." };
    }
  } catch {
    return { error: "Invalid URL" };
  }

  try {
    log.info({ url }, "Fetching page");

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
    const content = extractAsMarkdown(html, url, visitedUrls);

    log.info({ url, contentLength: content.length }, "Page extracted");

    return { content };
  } catch (err) {
    return { error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function scrapePageForEvents(content: string, url: string, log: any): Promise<Event[]> {
  const model = gateway(process.env.AI_MODEL || "anthropic/claude-sonnet-4-5-20250514");

  log.info({ url, contentLength: content.length }, "Starting scraper agent");

  const extractedEvents: Event[] = [];

  try {
    await generateText({
      model,
      maxTokens: 16384,
      system: `You are a JSON extraction agent. You receive wiki page content about maimai tour events (ちほー/つあーイベント).

Your ONLY job: extract event data from the page and call submitEvents with the results.

For each event found, extract:
- name: The event name (e.g. "IOSYSちほー")
- period: The date range string (開催期間), e.g. "2026/02/20～2026/04/16"
- steps: Array of reward steps, each with:
  - distance: number (km)
  - type: reward type (報酬の種類) e.g. "つあーメンバー", "課題曲", "ネームプレート", "フレーム", "解禁楽曲", "パーフェクトチャレンジ楽曲"
  - reward: reward name (報酬)

Rules:
- Only include events that have a reward steps table with at least one step.
- The distance must be a number.
- If the page has no events with reward tables, call submitEvents with an empty array.
- Call submitEvents exactly once with ALL events from this page.`,
      tools: {
        submitEvents: tool({
          description: "Submit all extracted events from this page.",
          inputSchema: z.object({
            events: z.array(EventSchema),
          }),
          execute: async ({ events }) => {
            log.info({ url, eventCount: events.length }, "Scraper agent extracted events");
            extractedEvents.push(...events);
            return { received: events.length };
          },
        }),
      },
      maxSteps: 2,
      prompt: `Extract all maimai tour event data from this page (${url}):\n\n${content}`,
      providerOptions: {
        gateway: {
          caching: 'auto',
        },
      },
    });

    if (extractedEvents.length === 0) {
      log.warn({ url }, "Scraper agent found no events");
    }

    return extractedEvents;
  } catch (err) {
    log.error({
      url,
      error: err instanceof Error
        ? { message: err.message, name: err.name }
        : String(err),
    }, "Scraper agent failed");
    // Return any events that were collected before the error
    return extractedEvents;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth - same pattern as other admin routes
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    const requestId = nanoid(10);
    const log = logger.child({ route: "admin/fetch_events", requestId });

    log.info("Starting event scraping");

    const collectedEvents: Event[] = [];
    const visitedUrls = new Set<string>();
    const pageContentCache = new Map<string, string>();
    let pagesVisited = 0;
    let totalSteps = 0;

    const MAX_ATTEMPTS = 5;

    const systemPrompt = `You are a web crawler agent for maimai tour event (つあーイベント) data from a Japanese wiki.

Your ONLY job is to discover pages that contain event reward tables and submit them for scraping. You do NOT parse event data yourself.

Your task:
1. Fetch the main event list page at ${START_URL}.
2. The main page itself contains many event reward tables inline — submit it with submitPageForScrape.
3. Some events on the main page say "詳しくはこちらをご覧ください" with a link to a DETAIL PAGE that has the reward table — submit those detail pages. These are event-specific pages like オンゲキちほー pages.
4. The main page links to past version event lists (終了イベントちほー一覧) — fetch and submit each of those pages too (e.g. PRiSM, BUDDiES, FESTiVAL, UNiVERSE, Splash, でらっくす versions).

IMPORTANT — What to submit vs what NOT to submit:
- DO submit: pages that contain event reward TABLES (距離[km] / 報酬の種類 / 報酬 columns)
- DO submit: the main page (${START_URL}) — it has many inline event tables
- DO submit: event detail pages linked from "こちら" links
- DO submit: past version event list pages (終了イベントちほー一覧)
- Do NOT submit: individual SONG pages (楽曲ページ) — these are linked from reward tables but contain song info, not event data
- Do NOT submit: pages about game mechanics, areas, tickets, etc.

You MUST complete all submissions without stopping. Do NOT ask if you should continue — just do it. Submit ALL pages you find, then stop.`;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const collectedNames = collectedEvents.map(e => e.name);
      const visitedList = Array.from(visitedUrls);

      let prompt: string;
      if (attempt === 0) {
        prompt = `Start by fetching ${START_URL}. Submit it for scraping (it has inline event tables). Then identify event detail pages (linked via "こちら") and past version event list pages (終了イベントちほー一覧) — fetch and submit each one. Do NOT submit individual song pages. Complete everything without stopping.`;
      } else {
        prompt = `Continue discovering maimai tour event pages. A previous attempt was interrupted.

Already scraped ${collectedEvents.length} events: ${collectedNames.join(", ")}

Already visited URLs: ${visitedList.join(", ")}

Continue from ${START_URL} and discover any pages NOT already visited. Call submitPageForScrape for each new page.`;
      }

      log.info({ attempt: attempt + 1, collectedSoFar: collectedEvents.length, visitedPages: visitedList.length }, "Starting discovery attempt");

      let hadStreamError = false;

      const stream = streamText({
        model: gateway(process.env.AI_MODEL || "anthropic/claude-sonnet-4-5-20250514"),
        system: systemPrompt,
        tools: {
          fetchPage: tool({
            description: "Fetch a page from the maimai wiki to read its content and find links. Only URLs under gamerch.com/maimai/ are allowed. This does NOT scrape events — use submitPageForScrape for that.",
            inputSchema: z.object({
              url: z.string().describe("The URL to fetch"),
            }),
            execute: async ({ url }) => {
              pagesVisited++;
              const result = await fetchPageContent(url, visitedUrls, log);
              if ("content" in result) {
                pageContentCache.set(url, result.content);
                log.info({ url, content: result.content }, "Page content");
              }
              return result;
            },
          }),
          submitPageForScrape: tool({
            description: "Submit a page URL for event data extraction by a separate AI agent. Call this for every page that contains event reward tables (距離/報酬). The page will be fetched automatically if not already cached.",
            inputSchema: z.object({
              url: z.string().describe("The URL of the page to scrape for events"),
            }),
            execute: async ({ url }) => {
              log.info({ url }, "Page submitted for scraping");

              // Use cached content or fetch
              let content = pageContentCache.get(url);
              if (!content) {
                const result = await fetchPageContent(url, visitedUrls, log);
                if ("error" in result) {
                  log.error({ url, error: result.error }, "Failed to fetch page for scraping");
                  return { error: result.error };
                }
                content = result.content;
                pageContentCache.set(url, content);
                pagesVisited++;
              }

              // Run the scraper agent on this page
              const events = await scrapePageForEvents(content, url, log);
              if (events.length > 0) {
                collectedEvents.push(...events);
                log.info({ url, newEvents: events.length, totalEvents: collectedEvents.length }, "Events collected from page");
              }

              return { success: true, eventsFound: events.length, totalCollected: collectedEvents.length };
            },
          }),
        },
        stopWhen: stepCountIs(30),
        onError({ error }) {
          hadStreamError = true;
          const errorInfo = error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack, cause: (error as any).cause?.message }
            : String(error);
          log.error({ errorInfo }, "Discovery stream error");
        },
        onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
          totalSteps++;
          const step = totalSteps;
          if (toolCalls?.length) {
            for (const tc of toolCalls) {
              log.info({
                step,
                tool: tc.toolName,
                args: tc.args,
              }, "Discovery tool call");
            }
          }
          if (toolResults?.length) {
            for (const tr of toolResults) {
              log.info({
                step,
                tool: tr.toolName,
                resultPreview: JSON.stringify(tr.result ?? null).slice(0, 300),
              }, "Discovery tool result");
            }
          }
          if (text) {
            log.info({ step, text }, "Discovery text");
          }
          if (finishReason === "error" || finishReason === "length") {
            log.error({ step, finishReason, usage }, "Discovery step error/truncation");
            hadStreamError = true;
          } else {
            log.info({ step, finishReason, usage }, "Discovery step finished");
          }
        },
        prompt,
        providerOptions: {
          gateway: {
            caching: 'auto',
          },
        },
      });

      try {
        await stream.steps;
      } catch (streamErr) {
        hadStreamError = true;
        log.error({
          attempt: attempt + 1,
          error: streamErr instanceof Error
            ? { message: streamErr.message, name: streamErr.name, cause: (streamErr as any).cause?.message }
            : String(streamErr),
        }, "Discovery stream threw exception");
      }

      if (!hadStreamError) {
        log.info({ attempt: attempt + 1 }, "Discovery completed successfully");
        break;
      }

      log.warn({
        attempt: attempt + 1,
        collectedSoFar: collectedEvents.length,
        willRetry: attempt < MAX_ATTEMPTS - 1,
      }, "Discovery had errors, retrying with fresh context");

      if (attempt === MAX_ATTEMPTS - 1) {
        log.warn({ attempts: MAX_ATTEMPTS, collectedEvents: collectedEvents.length }, "All attempts exhausted, returning partial results");
      }
    }

    log.info({
      events: collectedEvents.length,
      pagesVisited,
      totalSteps,
    }, "Event scraping complete");

    return NextResponse.json({
      success: true,
      events: collectedEvents,
      metadata: {
        totalSteps,
        pagesVisited,
      },
    });
  } catch (error) {
    console.error("Error in admin fetch_events route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
