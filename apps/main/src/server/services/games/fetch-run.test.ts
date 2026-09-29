import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  progress: vi.fn(),
  child: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ child: mocks.child }) }));

import { createFetchRun } from "./fetch-run";
import type { ScoreFetchContext } from "./types";

function context(signal = new AbortController().signal): ScoreFetchContext {
  return {
    game: "chunithm", userId: "user", region: "jp", token: "token", sessionId: BigInt(12), gameVersion: 9,
    flags: {} as Flags, shouldFetchAlbums: false, signal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.child.mockReturnValue(mocks.log);
});

describe("fetch run", () => {
  it("logs with the fetch's game, region, user and session", () => {
    expect(createFetchRun(context()).log).toBe(mocks.log);
    expect(mocks.child).toHaveBeenCalledWith({ game: "chunithm", region: "jp", userId: "user", sessionId: "12" });
  });

  it("records the completed state before the stage resolves", async () => {
    let recorded = false;
    mocks.progress.mockImplementationOnce(async () => { recorded = true; });
    const run = createFetchRun(context());
    await expect(run.stage("profile", async () => "player", "player_data")).resolves.toBe("player");
    expect(recorded).toBe(true);
    expect(mocks.progress).toHaveBeenCalledExactlyOnceWith(BigInt(12), "player_data", "chunithm");
    expect(mocks.log.info).toHaveBeenCalledWith({ stepType: "profile", durationMs: expect.any(Number) }, "Fetch stage completed");
  });

  it("records nothing for a stage that completes no state", async () => {
    await createFetchRun(context()).stage("icon", async () => "url");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("logs a failed stage once and rethrows it without recording progress", async () => {
    const failure = new Error("page changed");
    await expect(createFetchRun(context()).stage("scores", async () => { throw failure; }, "song_data:basic")).rejects.toBe(failure);
    expect(mocks.log.warn).toHaveBeenCalledExactlyOnceWith({ err: failure, stepType: "scores", durationMs: expect.any(Number) }, "Fetch stage failed");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("does not start a stage once the fetch is aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("timed out");
    controller.abort(reason);
    const work = vi.fn();
    await expect(createFetchRun(context(controller.signal)).stage("scores", work, "song_data:basic")).rejects.toBe(reason);
    expect(work).not.toHaveBeenCalled();
  });

  it("discards a stage that finishes after the fetch was aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("timed out");
    const run = createFetchRun(context(controller.signal));
    await expect(run.stage("profile", async () => { controller.abort(reason); return "late"; }, "player_data")).rejects.toBe(reason);
    expect(mocks.progress).not.toHaveBeenCalled();
  });
});
