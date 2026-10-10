import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postDiscordEmbed } from "./webhook";

const background = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => background.push(task) }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://example.test" }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }, flushLogger: vi.fn(async () => {}) }));

let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
beforeEach(() => {
  fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => { vi.unstubAllGlobals(); background.length = 0; });

describe("postDiscordEmbed", () => {
  it("cuts an overlong description at a line boundary within Discord's limit", async () => {
    const lines = Array.from({ length: 300 }, (_, index) => `line ${String(index).padStart(3, "0")} of the update`);
    postDiscordEmbed("https://example.test/webhook", { game: "maimai", region: "jp" }, {
      title: "Update", color: 0, timestamp: "2026-01-01T00:00:00.000Z", description: lines.join("\n"),
    });
    await Promise.all(background);
    const { description } = JSON.parse(String(fetch.mock.calls[0][1]?.body)).embeds[0];
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/\n… \(truncated\)$/);
    const kept = description.slice(0, -"\n… (truncated)".length).split("\n");
    expect(kept).toEqual(lines.slice(0, kept.length));
  });
});
