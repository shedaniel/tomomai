import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { FetchingContextExtended } from "./types";
import type { PendingSong } from "@/server/services/catalog/maimai/types";
import { FillMissingFetcher } from "./fill-level";

function context(version: 8 | 9): FetchingContextExtended {
  return {
    region: "jp", version, cookies: "", log: pino({ enabled: false }),
    notice: { details: [], addDetail: vi.fn() }, previous: null,
    current: FillMissingFetcher, fetcherIndex: 0,
  };
}

const chart: PendingSong = { songName: "Chart", type: "dx", difficulty: "master", level: "14+" };

describe("maimai FillMissing stage", () => {
  it("uses the shared fallback and records estimates without replacing known values", async () => {
    const [estimated, confirmed] = await FillMissingFetcher(context(9), [chart, { ...chart, levelPrecise: { important: true, value: 149 } }]);
    expect(estimated).toMatchObject({ levelPrecise: 146, metadata: { levelPreciseEstimated: true } });
    expect(confirmed).toMatchObject({ levelPrecise: { important: true, value: 149 }, metadata: { levelPreciseEstimated: false } });
    expect((await FillMissingFetcher(context(8), [chart]))[0].levelPrecise).toBe(147);
  });

  it("retains the existing maimai mismatch repair policy", async () => {
    const [repaired] = await FillMissingFetcher(context(9), [{ ...chart, level: "14", levelPrecise: 149 }]);
    expect(repaired).toMatchObject({ levelPrecise: 140, metadata: { levelPreciseEstimated: true } });
    expect((await FillMissingFetcher(context(9), [{ ...chart, level: "6", levelPrecise: 69 }]))[0].levelPrecise).toBe(69);
  });
});
