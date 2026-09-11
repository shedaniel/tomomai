import { describe, expect, it } from "vitest";
import { formatSongInstanceId, parseSongId } from "./song-instance-id";
import { decodeMessage, encodeMessage, mintRenderToken, verifyRenderToken, type RenderMessage } from "@tomomai/render-token";

const header = {
  scale: 1 as const, exp: 1800000000, gameVersion: 14, region: "jp" as const,
  rating: 15000, displayName: "プレイヤー", iconUrl: "https://example.com/icon.png",
  title: "Title", titleType: "normal" as const, classRankUrl: "", courseRankUrl: "",
};
const chart = { songId: "Ab3xK9pQ:j14", achievement: 1005000, fc: "ap+" as const, fs: "fdx+" as const };

describe("song instance identifiers", () => {
  it("round-trips each region and signed historical versions", () => {
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const gameVersion of [-32768, -1, 0, 14, 32767]) {
        expect(parseSongId(formatSongInstanceId("Ab3xK9pQ", region, gameVersion))).toEqual({
          kind: "instance", parentPublicId: "Ab3xK9pQ", region, gameVersion,
        });
      }
    }
    expect(parseSongId("Ab3xK9pQ")).toEqual({ kind: "parent", parentPublicId: "Ab3xK9pQ" });
  });

  it.each(["", "123456789", "bad/id!!", "Ab3xK9pQ:", "Ab3xK9pQ:x1", "Ab3xK9pQ:j01", "Ab3xK9pQ:j-0", "Ab3xK9pQ:j32768", "Ab3xK9pQ:j-32769", "Ab3xK9pQ:j1:2"])("rejects malformed ID %s", id => {
    expect(parseSongId(id)).toBeNull();
  });
});

describe("render token v2", () => {
  const messages: RenderMessage[] = [
    { route: "export-image", header, payload: { visitableProfileAt: "player", charts: [chart, { ...chart, songId: "Ab3xK9pQ:j-1" }] } },
    { route: "daily-plays", header, payload: { day: "2026-09-11", plays: [chart] } },
    { route: "last-credit", header, payload: { playedAt: 1800000000, tracks: [{ ...chart, dxScore: 500, maxDxScore: 600, details: null }] } },
  ];

  it.each(messages)("round-trips $route and verifies its signature", message => {
    const bytes = encodeMessage(message);
    expect(bytes[0]).toBe(2);
    expect(decodeMessage(bytes)).toEqual(message);
    const token = mintRenderToken(message, "test-secret");
    expect(verifyRenderToken(token, "test-secret")).toEqual({ ok: true, message });
    expect(verifyRenderToken(token, "wrong-secret")).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects old wire versions and noncanonical song identifiers", () => {
    const bytes = encodeMessage(messages[0]);
    bytes[0] = 1;
    expect(() => decodeMessage(bytes)).toThrow("unsupported version");
    for (const songId of ["a".repeat(21), "Ab3xK9pQ", "Ab3xK9pQ:j01", "Ab3xK9pQ:j32768"]) {
      expect(() => encodeMessage({ route: "daily-plays", header, payload: { day: "2026-09-11", plays: [{ ...chart, songId }] } })).toThrow("invalid song instance id");
    }
  });

  it("uses the same 15-byte chart width across regions and signed version bounds", () => {
    const empty: RenderMessage = { route: "daily-plays", header, payload: { day: "2026-09-11", plays: [] } };
    const baseLength = encodeMessage(empty).length;
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const version of [-32768, -1, 0, 14, 32767]) {
        const songId = formatSongInstanceId("Ab3xK9pQ", region, version);
        const message: RenderMessage = { ...empty, header: { ...header, region }, payload: { ...empty.payload, plays: [{ ...chart, songId }] } };
        const bytes = encodeMessage(message);
        expect(bytes.length - baseLength).toBe(15);
        expect(decodeMessage(bytes)).toEqual(message);
        expect([...bytes.slice(baseLength, baseLength + 8)]).toEqual([..."Ab3xK9pQ"].map(char => char.charCodeAt(0)));
        expect([...bytes.slice(baseLength + 8, baseLength + 10)]).toEqual([(version >>> 8) & 255, version & 255]);
      }
    }
  });

  it("rejects a chart region that differs from the header on every route", () => {
    for (const message of messages) {
      expect(() => encodeMessage({ ...message, header: { ...header, region: "intl" } })).toThrow("song region must match header region");
    }
  });

  it("rejects corrupt fixed-width IDs and truncated chart records", () => {
    const empty: RenderMessage = { route: "daily-plays", header, payload: { day: "2026-09-11", plays: [] } };
    const offset = encodeMessage(empty).length;
    const bytes = encodeMessage({ ...empty, payload: { ...empty.payload, plays: [chart] } });
    const badRegion = bytes.slice();
    badRegion[8] = 3;
    expect(() => decodeMessage(badRegion)).toThrow("enum index out of range");
    const badParent = bytes.slice();
    badParent[offset] = 47;
    expect(() => decodeMessage(badParent)).toThrow("invalid song instance id");
    expect(() => decodeMessage(bytes.slice(0, offset + 9))).toThrow("unexpected end");
  });
});
