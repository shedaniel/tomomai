import { describe, expect, it } from "vitest";
import { decodeMessage, encodeMessage, mintRenderToken, verifyRenderToken, type RenderMessage } from "@tomomai/render-token";

const header = {
  scale: 2 as const, exp: 1800000000, gameVersion: 9, region: "jp" as const,
  rating: 1725, displayName: "ＰＬＡＹＥＲ", iconUrl: "https://example.com/icon.png", title: "Title",
};
const chart = { songId: "Ab3xK9pQ:j9", scoreValue: 1_009_000, comboStatus: 3, syncStatus: 2, clearStatus: 5, rating: 1665 };

describe("CHUNITHM render messages", () => {
  const messages: RenderMessage[] = [
    {
      game: "chunithm", route: "export-image", header,
      payload: { visitableProfileAt: null, newCharts: [chart], oldCharts: [{ ...chart, songId: "Zz_-0123:j8", rating: 1600 }] },
    },
    { game: "chunithm", route: "daily-plays", header, payload: { day: "2026-09-11", plays: [chart, chart] } },
  ];

  it.each(messages)("round-trips $route and verifies its signature", message => {
    const bytes = encodeMessage(message);
    expect([...bytes.slice(0, 3)]).toEqual([3, 1, message.route === "export-image" ? 0 : 2]);
    expect(decodeMessage(bytes)).toEqual(message);
    const token = mintRenderToken(message, "test-secret");
    expect(verifyRenderToken(token, "test-secret")).toEqual({ ok: true, message });
  });

  it("spends 18 bytes per chart", () => {
    const empty = { game: "chunithm", route: "daily-plays", header, payload: { day: "2026-09-11", plays: [] } } satisfies RenderMessage;
    const one = encodeMessage({ ...empty, payload: { ...empty.payload, plays: [chart] } });
    expect(one.length - encodeMessage(empty).length).toBe(18);
  });

  it("refuses values its fixed-width fields cannot hold", () => {
    for (const bad of [{ scoreValue: 0x1000000 }, { comboStatus: 256 }, { rating: -1 }, { rating: 17.5 }]) {
      const message = { game: "chunithm", route: "daily-plays", header, payload: { day: "2026-09-11", plays: [{ ...chart, ...bad }] } } satisfies RenderMessage;
      expect(() => encodeMessage(message)).toThrow("out of range");
    }
  });

  it("refuses a route CHUNITHM has no image for", () => {
    const bytes = encodeMessage(messages[1]);
    bytes[2] = 1;
    expect(() => decodeMessage(bytes)).toThrow("no last-credit render for chunithm");
  });
});
