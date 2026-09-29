import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { runFetchers, type CatalogStage } from "./runner";
import type { CatalogCollectContext, SourceChart } from "./types";

vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn(async () => {}) }));
import { sendDiscordNotice } from "@/server/services/discord/webhook";

const context: CatalogCollectContext = { region: "jp", version: 9, session: { cookies: "" }, log: pino({ enabled: false }) };
const pending: SourceChart = { game: "maimai", songName: "Link", chartType: 1, difficulty: 3, level: "13" };
const complete = { artist: "Artist", cover: "cover.png", genre: "maimai", levelPrecise: 130, addedVersion: 8 };
const notices = () => vi.mocked(sendDiscordNotice).mock.calls.map(([game, region, title, body]) => ({ game, region, title, body }));

beforeEach(() => vi.clearAllMocks());

describe("catalog stage runner", () => {
  it("passes the collected charts through each stage and reports what each one added or modified", async () => {
    const source: CatalogStage = {
      name: "Source",
      run: async (ctx, charts) => {
        expect(charts).toEqual([]);
        ctx.notice.addDetail("Fetched source chart");
        return [pending];
      },
    };
    const fill: CatalogStage = {
      name: "Fill",
      run: async (_ctx, charts) => {
        expect(charts).toEqual([expect.objectContaining(pending)]);
        return charts.map(chart => ({ ...chart, ...complete }));
      },
    };
    const validate = vi.fn();
    const charts = await runFetchers(context, { game: "maimai", stages: [source, fill], validate });

    expect(charts).toEqual([{ ...pending, ...complete }]);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(notices()).toEqual([
      { game: "maimai", region: "jp", title: "Stage 1/2: Source", body: expect.stringContaining("+1 added, ~0 modified\nAdded: Link@dx@master\nFetched source chart") },
      { game: "maimai", region: "jp", title: "Stage 2/2: Fill", body: expect.stringContaining("+0 added, ~1 modified\nModified: Link@dx@master") },
      { game: "maimai", region: "jp", title: "Fetch pipeline completed", body: "**Total songs: 1** (2 stages)" },
    ]);
  });

  it("stops later stages and completion when a stage fails", async () => {
    const failure = new Error("source failed");
    const fill = vi.fn();
    await expect(runFetchers(context, { game: "maimai", stages: [{ name: "Source", run: vi.fn().mockRejectedValue(failure) }, { name: "Fill", run: fill }] })).rejects.toBe(failure);
    expect(fill).not.toHaveBeenCalled();
    expect(sendDiscordNotice).not.toHaveBeenCalled();
  });

  it("rejects charts that are still incomplete after the last stage, without a completion notice", async () => {
    await expect(runFetchers(context, { game: "maimai", stages: [{ name: "Source", run: async () => [pending] }] }))
      .rejects.toThrow("Errors occurred during song update");
    expect(notices().map(notice => notice.title)).toEqual(["Stage 1/1: Source"]);
  });
});
