import { expect, it, vi } from "vitest";
import pino from "pino";

vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(async () => JSON.stringify([{
      title: " Ｌｉｎｋ ", artist: "Artist", genre: "maimai", type: "dx", addedVersion: 9, cover: "cover.png",
      levels: { master: { level: "13", levelPrecise: 130 } },
    }])),
  },
}));

import { FallbackFetcher } from "./fallback";

it("names fallback charts in maimai's normalized title form, which the upload contract requires", async () => {
  const notice = { details: [], addDetail: vi.fn() };
  const charts = await FallbackFetcher({ region: "jp", version: 9, session: { cookies: "" }, log: pino({ enabled: false }), notice }, []);
  expect(charts.map(chart => chart.songName)).toEqual(["Link"]);
});
