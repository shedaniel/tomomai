import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { findCreditSummary, groupIntoCredits, listCreditSummaries, takeCreditFrom } from "./credit-data";

const at = (time: string) => Date.parse(`${time}Z`) / 1000;
const play = (playedAt: string, track: number, difficultyCode = 3) => ({
  playedAt, track, songId: `song${track}:j13`, songName: `Song ${track}`, cover: `cover${track}`, difficultyCode,
});
const summaryTrack = (track: number, difficultyCode = 3) => {
  const { playedAt: _playedAt, ...rest } = play("", track, difficultyCode);
  return rest;
};

beforeEach(() => proxy.reset());

describe("credit grouping", () => {
  it("starts a new credit wherever the next older track number is not lower", () => {
    const tracks = [2, 1, 3, 2, 1, 1].map(track => ({ track }));
    expect(groupIntoCredits(tracks).map(credit => credit.map(row => row.track))).toEqual([[2, 1], [3, 2, 1], [1]]);
  });

  it("takes the credit starting at a time, newest first, and nothing when no play starts then", () => {
    const rows = [1, 2, 3, 1].map((track, i) => ({ track, playedAt: new Date(Date.UTC(2026, 8, 1, 0, i)) }));
    expect(takeCreditFrom(rows, rows[0].playedAt).map(row => row.track)).toEqual([3, 2, 1]);
    expect(takeCreditFrom(rows, new Date(Date.UTC(2026, 8, 1, 0, 0, 30)))).toEqual([]);
  });
});

describe("listCreditSummaries", () => {
  it("pages whole credits newest first, with the next cursor at the last credit on the page", async () => {
    proxy.respond([
      play("2026-09-01 01:20:00", 3), play("2026-09-01 01:15:00", 2), play("2026-09-01 01:10:00", 1),
      play("2026-09-01 00:50:00", 2, 0), play("2026-09-01 00:45:00", 1, 0),
    ]);
    const result = await listCreditSummaries("owner", "jp", { limit: 1 });
    expect(result).toEqual({
      credits: [{ at: at("2026-09-01T01:10:00"), tracks: [summaryTrack(1), summaryTrack(2), summaryTrack(3)] }],
      nextCursor: at("2026-09-01T01:10:00"),
    });
    expect(proxy.queries[0].sql).toContain(`"user_recent_songs"."game" = $`);
    expect(proxy.queries[0].params).toContain("maimai");
  });

  it("drops the oldest group when the row limit may have cut it", async () => {
    proxy.respond([
      play("2026-09-01 01:20:00", 4), play("2026-09-01 01:15:00", 3), play("2026-09-01 01:10:00", 2), play("2026-09-01 01:05:00", 1),
      play("2026-09-01 00:50:00", 4), play("2026-09-01 00:45:00", 3), play("2026-09-01 00:40:00", 2), play("2026-09-01 00:35:00", 1),
    ]);
    const result = await listCreditSummaries("owner", "jp", { limit: 1 });
    expect(result.credits.map(credit => credit.at)).toEqual([at("2026-09-01T01:05:00")]);
    expect(result.nextCursor).toBe(at("2026-09-01T01:05:00"));
  });

  it("ends the list when the last page holds every remaining credit", async () => {
    proxy.respond([play("2026-09-01 01:10:00", 1)]);
    expect((await listCreditSummaries("owner", "jp", { limit: 5, cursor: at("2026-09-01T02:00:00") })).nextCursor).toBeNull();
  });
});

describe("findCreditSummary", () => {
  it("finds the credit whose first track was played at the time", async () => {
    proxy.respond([play("2026-09-01 01:10:00", 1), play("2026-09-01 01:15:00", 2), play("2026-09-01 01:30:00", 1)]);
    expect(await findCreditSummary("owner", "jp", at("2026-09-01T01:10:00"))).toEqual({
      at: at("2026-09-01T01:10:00"),
      tracks: [summaryTrack(1), summaryTrack(2)],
    });
  });

  it("answers null when no credit starts then", async () => {
    proxy.respond([play("2026-09-01 01:15:00", 2)]);
    expect(await findCreditSummary("owner", "jp", at("2026-09-01T01:10:00"))).toBeNull();
  });
});
