import { describe, it, expect } from "vitest";
import { extractAsMarkdown, discoverLinks } from "./route";
import { logger } from "@/lib/logger";

const BASE_URL = "https://gamerch.com/maimai/910515";

function wrap(body: string) {
  return `<html><body><div class="main">${body}</div></body></html>`;
}

describe("extractAsMarkdown", () => {
  it("strips links in reward table rows (song links)", () => {
    const html = wrap(`
      <table>
        <tr>
          <td style="text-align:center">375</td>
          <td style="text-align:center">課題曲</td>
          <td style="text-align:center"><a href="https://gamerch.com/maimai/966005" title="むしみこうにゃーのハッピッピー">むしみこうにゃーのハッピッピー</a></td>
        </tr>
      </table>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain("むしみこうにゃーのハッピッピー");
    expect(result).not.toContain("[むしみこうにゃーのハッピッピー]");
    expect(result).not.toContain("966005");
  });

  it("preserves links in event list tables (no numeric-only cell)", () => {
    const html = wrap(`
      <table>
        <thead>
          <tr><th colspan="2">終了イベントちほー一覧</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><a href="https://gamerch.com/maimai/910515" title="終了イベントちほー（PRiSM）"><span>PRiSM</span></a></td>
            <td><a href="https://gamerch.com/maimai/941805" title="終了イベントちほー（PRiSM PLUS）"><span>PRiSM PLUS</span></a></td>
          </tr>
          <tr>
            <td><a href="https://gamerch.com/maimai/839192" title="終了イベントちほー（BUDDiES）"><span>BUDDiES</span></a></td>
            <td><a href="https://gamerch.com/maimai/871568" title="終了イベントちほー（BUDDiES PLUS）"><span>BUDDiES PLUS</span></a></td>
          </tr>
        </tbody>
      </table>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    // Current page link should be stripped (same URL as baseUrl)
    expect(result).not.toContain("[PRiSM](");
    // Other links should be preserved with titles
    expect(result).toContain('[PRiSM PLUS](https://gamerch.com/maimai/941805 "終了イベントちほー（PRiSM PLUS）")');
    expect(result).toContain('[BUDDiES](https://gamerch.com/maimai/839192 "終了イベントちほー（BUDDiES）")');
    expect(result).toContain('[BUDDiES PLUS](https://gamerch.com/maimai/871568 "終了イベントちほー（BUDDiES PLUS）")');
  });

  it("strips multiple song links in a reward table", () => {
    const html = wrap(`
      <table>
        <tr>
          <td>100</td>
          <td>課題曲</td>
          <td><a href="https://gamerch.com/maimai/111111">Song A</a></td>
        </tr>
        <tr>
          <td>200</td>
          <td>解禁楽曲</td>
          <td><a href="https://gamerch.com/maimai/222222">Song B</a></td>
        </tr>
        <tr>
          <td>375</td>
          <td>ネームプレート</td>
          <td><a href="https://gamerch.com/maimai/333333">Some Reward</a></td>
        </tr>
      </table>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).not.toContain("111111");
    expect(result).not.toContain("222222");
    expect(result).not.toContain("333333");
    expect(result).toContain("Song A");
    expect(result).toContain("Song B");
    expect(result).toContain("Some Reward");
  });

  it("preserves こちら detail links (not in reward rows)", () => {
    const html = wrap(`
      <p>詳しくは<a href="https://gamerch.com/maimai/872602">こちら</a>をご覧ください</p>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain("[こちら](https://gamerch.com/maimai/872602)");
  });

  it("includes title attribute in markdown links", () => {
    const html = wrap(`
      <p><a href="https://gamerch.com/maimai/872602" title="オンゲキちほーまとめ">こちら</a></p>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain('[こちら](https://gamerch.com/maimai/872602 "オンゲキちほーまとめ")');
  });

  it("strips links in song list tables (曲名 header)", () => {
    const html = wrap(`
      <table>
        <tr>
          <th>ジャンル</th>
          <th>曲名</th>
          <th>アーティスト</th>
        </tr>
        <tr>
          <td rowspan="7"><span>P&ア</span></td>
        </tr>
        <tr>
          <td><a href="https://gamerch.com/maimai/714989" title="INTERNET OVERDOSE">INTERNET OVERDOSE</a></td>
          <td>Aiobahn feat. KOTOKO</td>
        </tr>
        <tr>
          <td><a href="https://gamerch.com/maimai/839569" title="INTERNET YAMERO">INTERNET YAMERO</a></td>
          <td>Aiobahn feat. KOTOKO</td>
        </tr>
      </table>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain("INTERNET OVERDOSE");
    expect(result).toContain("INTERNET YAMERO");
    expect(result).not.toContain("[INTERNET OVERDOSE]");
    expect(result).not.toContain("[INTERNET YAMERO]");
    expect(result).not.toContain("714989");
    expect(result).not.toContain("839569");
  });

  it("preserves hash fragments in links", () => {
    const html = wrap(`
      <p>詳しくは<a href="https://gamerch.com/maimai/714449#Arcaea2" title="終了イベントちほー（FESTiVAL）#Arcaea2">Arcaeaちほー2</a>をご覧ください</p>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain('[Arcaeaちほー2](https://gamerch.com/maimai/714449#Arcaea2 "終了イベントちほー（FESTiVAL）#Arcaea2")');
  });

  it("strips same-page links even with different hash fragments", () => {
    const html = wrap(`
      <p><a href="https://gamerch.com/maimai/910515#section1">Section 1</a></p>
      <p><a href="https://gamerch.com/maimai/910515#section2">Section 2</a></p>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain("Section 1");
    expect(result).toContain("Section 2");
    expect(result).not.toContain("[Section 1]");
    expect(result).not.toContain("[Section 2]");
  });

  it("strips links that are in visitedUrls", () => {
    const html = wrap(`
      <p><a href="https://gamerch.com/maimai/999999">Some Page</a></p>
    `);

    const visited = new Set(["https://gamerch.com/maimai/999999"]);
    const result = extractAsMarkdown(html, BASE_URL, visited);
    expect(result).toContain("Some Page");
    expect(result).not.toContain("[Some Page]");
  });

  it("removes BBS/thread sections", () => {
    const html = wrap(`
      <p><a href="https://gamerch.com/maimai/123456">Real Link</a></p>
      <ul class="bbs__normal">
        <li><a href="https://gamerch.com/maimai/533405?ref=latestThread#comment">Thread Link</a></li>
      </ul>
    `);

    const result = extractAsMarkdown(html, BASE_URL, new Set());
    expect(result).toContain("[Real Link]");
    expect(result).not.toContain("Thread Link");
    expect(result).not.toContain("533405");
  });
});

describe("extractAsMarkdown integration", () => {
  const PAGE_URL = "https://gamerch.com/maimai/910515";

  async function fetchAndExtract(visited = new Set<string>()) {
    const response = await fetch(PAGE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; maimai-charts-bot/1.0)",
        "Accept": "text/html",
        "Accept-Language": "ja,en;q=0.5",
      },
    });
    const html = await response.text();
    return extractAsMarkdown(html, PAGE_URL, visited);
  }

  function extractLinks(text: string) {
    const links: { text: string; url: string }[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      links.push({ text: match[1].replace(/\n/g, " ").trim(), url: match[2] });
    }
    return links;
  }

  it("produces only event-related links (no song pages)", async () => {
    const result = await fetchAndExtract();
    const links = extractLinks(result);

    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const isEventLink =
        link.url.includes("/author/") ||
        link.text.includes("こちら") ||
        link.text.includes("ちほー") ||
        link.text.includes("常設") ||
        link.text.includes("開催");
      expect(
        isEventLink,
        `Unexpected link found: [${link.text}](${link.url})`,
      ).toBe(true);
    }
  }, 15000);

  it("contains expected event detail links", async () => {
    const result = await fetchAndExtract();
    const links = extractLinks(result);
    const urls = links.map((l) => l.url);

    // Main event page link (常設・開催中ちほーはこちら)
    expect(urls.some((u) => u.startsWith("https://gamerch.com/maimai/533627"))).toBe(true);
    // オンゲキちほー detail (こちら → 533910#ongeki8)
    expect(urls.some((u) => u.startsWith("https://gamerch.com/maimai/533910"))).toBe(true);
    // Arcaeaちほー → Splash events (533913#Arcaea)
    expect(urls.some((u) => u.startsWith("https://gamerch.com/maimai/533913"))).toBe(true);
    // Arcaeaちほー2 → FESTiVAL events (714449#Arcaea2)
    expect(urls.some((u) => u.startsWith("https://gamerch.com/maimai/714449"))).toBe(true);
  }, 15000);

  it("contains no song page IDs that were on the original page", async () => {
    const result = await fetchAndExtract();

    // These are song page IDs known to be in reward/song tables on this page
    const songPageIds = [
      "534671", // 踊
      "714188", // 阿修羅ちゃん
      "714989", // INTERNET OVERDOSE
      "839569", // INTERNET YAMERO
      "871315", // 愛包ダンスホール
      "871742", // 勇者
      "871880", // 唱
      "534493", // お願いマッスル
      "533868", // I'm with you
    ];

    for (const id of songPageIds) {
      expect(
        result,
        `Song page link gamerch.com/maimai/${id} should have been stripped`,
      ).not.toContain(`gamerch.com/maimai/${id}`);
    }
  }, 15000);
});

describe("discoverLinks integration", () => {
  const log = logger.child({ test: true });

  async function fetchContent(url: string) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; maimai-charts-bot/1.0)",
        "Accept": "text/html",
        "Accept-Language": "ja,en;q=0.5",
      },
    });
    const html = await response.text();
    return extractAsMarkdown(html, url, new Set());
  }

  it("discovers all expected pages from the main page (533627)", async () => {
    const url = "https://gamerch.com/maimai/533627";
    const content = await fetchContent(url);
    const result = await discoverLinks(content, url, new Set(), log);

    console.log("Main page discovery:", JSON.stringify(result, null, 2));

    expect(result.shouldScrape).toBe(true);

    const expectedPages = [
      // Past version event list pages
      "910515",  // PRiSM
      "941805",  // PRiSM PLUS
      "839192",  // BUDDiES
      "871568",  // BUDDiES PLUS
      "714449",  // FESTiVAL
      "797298",  // FESTiVAL PLUS
      "534104",  // UNiVERSE
      "534688",  // UNiVERSE PLUS
      "533913",  // Splash
      "533946",  // Splash PLUS
      "533828",  // でらっくす
      "533869",  // でらっくす PLUS
      // Event detail / こちら links
      "533910",  // オンゲキちほーまとめ
      "533908",  // 無限ちほー
      "813771",  // 裏 月面ちほー (project_raputa)
      // Area event pages
      "533950",  // エリア別ちほー一覧
      "534028",  // 青春エリア (スカイストリートちほー)
      "533907",  // 神様エリア (高天原ちほー)
      "534050",  // 終末エリア (kawaiiちほー)
      "533997",  // はじまりエリア (トリコロ/なないろ/ハピフェスちほー)
      "534020",  // 世界樹エリア (ドラゴンちほー)
      "534019",  // プリズムエリア (7sRefちほー)
      "534027",  // 黒薔薇エリア (BLACK ROSEちほー)
    ];

    for (const pageId of expectedPages) {
      expect(
        result.links.some((l) => l.includes(pageId)),
        `Expected link to page ${pageId} not found in discovery results. Got: ${result.links.join(", ")}`,
      ).toBe(true);
    }
  }, 60000);

  it("discovers expected event detail links from PRiSM past events page (910515)", async () => {
    const url = "https://gamerch.com/maimai/910515";
    const content = await fetchContent(url);
    const result = await discoverLinks(content, url, new Set(), log);

    console.log("PRiSM page discovery:", JSON.stringify(result, null, 2));

    expect(result.shouldScrape).toBe(true);

    // Should find these event detail / cross-reference pages
    const expectedPages = [
      "533627",  // main event page (back-link)
      "533910",  // オンゲキちほーまとめ (こちら detail)
      "533913",  // Splash events (Arcaeaちほー)
      "714449",  // FESTiVAL events (Arcaeaちほー2)
    ];

    for (const pageId of expectedPages) {
      expect(
        result.links.some((l) => l.includes(pageId)),
        `Expected link to page ${pageId} not found in discovery results. Got: ${result.links.join(", ")}`,
      ).toBe(true);
    }
  }, 60000);
});
