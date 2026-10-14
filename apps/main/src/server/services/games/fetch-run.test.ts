import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  progress: vi.fn(),
  child: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/server/services/games/fetch-progress", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ child: mocks.child }) }));

import { createFetchRun, fetchFailure, FetchStageError } from "./fetch-run";
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
  it("records the completed state before the stage resolves", async () => {
    let recorded = false;
    mocks.progress.mockImplementationOnce(async () => { recorded = true; });
    const run = createFetchRun(context());
    await expect(run.stage("profile", async () => "player", "player_data")).resolves.toBe("player");
    expect(recorded).toBe(true);
    expect(mocks.progress).toHaveBeenCalledExactlyOnceWith(BigInt(12), "player_data");
  });

  it("rethrows a failed stage with its step and message for the fetch to log, recording no progress", async () => {
    const failure = new Error("page changed");
    const error = await createFetchRun(context()).stage("scores", async () => { throw failure; }, "song_data:basic").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(FetchStageError);
    expect(error).toMatchObject({ message: "page changed", stepType: "scores", cause: failure });
    expect(fetchFailure(error)).toEqual({ err: failure, stepType: "scores", durationMs: expect.any(Number) });
    expect(mocks.log.warn).not.toHaveBeenCalled();
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

  it("does not blame a stage whose request failed because the fetch was aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("timed out");
    const run = createFetchRun(context(controller.signal));
    const error = await run.stage("scores", async () => { controller.abort(reason); throw reason; }).catch((err: unknown) => err);
    expect(error).toBe(reason);
  });
});
