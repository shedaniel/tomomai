import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postDiscordEmbed, sendDiscordNotice } from "./webhook";

const background = vi.hoisted(() => [] as Promise<unknown>[]);
const logger = vi.hoisted(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => background.push(task) }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://example.test" }));
vi.mock("@/lib/logger", () => ({ logger, flushLogger: vi.fn(async () => {}) }));

let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
beforeEach(() => {
  vi.clearAllMocks();
  fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); background.length = 0; });

async function delivered() {
  await Promise.all(background);
  return JSON.parse(String(fetch.mock.calls[0][1]?.body));
}

describe("sendDiscordNotice", () => {
  it("identifies CHUNITHM notices independently of the host's frontend game", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_NOTICE", "https://example.test/notice");
    await sendDiscordNotice("chunithm", "jp", "Fetch pipeline completed", "Complete");
    const payload = await delivered();
    expect(payload.username).toBe("ともチュウ");
    expect(payload).not.toHaveProperty("avatar_url");
    expect(payload.embeds[0].title).toBe("[CHUNITHM / Japan] Fetch pipeline completed");
  });

  it("posts nothing when the notice webhook is not configured", async () => {
    vi.stubEnv("DISCORD_UPDATE_WEBHOOK_NOTICE", undefined);
    await sendDiscordNotice("maimai", "jp", "Tour Events Update", "Changed");
    await Promise.all(background);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("postDiscordEmbed", () => {
  const embed = { title: "Update", color: 0, timestamp: "2026-01-01T00:00:00.000Z" };

  it("cuts an overlong description at a line boundary within Discord's limit", async () => {
    const lines = Array.from({ length: 300 }, (_, index) => `line ${String(index).padStart(3, "0")} of the update`);
    postDiscordEmbed("https://example.test/webhook", { game: "maimai", region: "jp" }, { ...embed, description: lines.join("\n") });
    const { description } = (await delivered()).embeds[0];
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/\n… \(truncated\)$/);
    const kept = description.slice(0, -"\n… (truncated)".length).split("\n");
    expect(kept).toEqual(lines.slice(0, kept.length));
  });

  it("posts as the game's bot with its brand icon", async () => {
    postDiscordEmbed("https://example.test/webhook", { game: "maimai", region: "jp" }, embed);
    const payload = await delivered();
    expect(payload.username).toBe("ともマイ");
    expect(payload.avatar_url).toBe("https://example.test/icon.png");
  });

  it("logs a rejected delivery with its game and region", async () => {
    fetch.mockResolvedValue(new Response("invalid embed", { status: 400, statusText: "Bad Request" }));
    postDiscordEmbed("https://example.test/webhook", { game: "chunithm", region: "intl" }, embed);
    await Promise.all(background);
    expect(logger.error).toHaveBeenCalledWith(
      { game: "chunithm", region: "intl", status: 400, statusText: "Bad Request", body: "invalid embed" },
      "Discord webhook failed",
    );
  });
});
