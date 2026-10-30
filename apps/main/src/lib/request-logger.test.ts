import { NextRequest } from "next/server";
import pino from "pino";
import { Writable } from "stream";
import { describe, expect, it, vi } from "vitest";

const flushLogger = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./logger", async (importOriginal) => ({ ...(await importOriginal<typeof import("./logger")>()), flushLogger }));

import { logContextMixin } from "./logger";
import { withLogContext, withRequestLogContext } from "./request-logger";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const log = pino({ base: undefined, timestamp: false, mixin: logContextMixin }, stream);
  return { log, lines, parsed: () => lines.map((line) => JSON.parse(line)) };
}

describe("log context", () => {
  it("adds nothing outside a context", () => {
    const { log, parsed } = capture();
    log.info("hello");
    expect(parsed()).toEqual([{ level: 30, msg: "hello" }]);
  });

  it("stamps every logger, including ones created earlier, with the request's fields", async () => {
    const { log, parsed } = capture();
    const moduleLog = log.child({ context: "lib" });
    const GET = withRequestLogContext("test-route", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      moduleLog.info("deep in lib code");
      return new Response("ok");
    });

    await GET(new NextRequest("https://example.test/", { headers: { "x-request-id": "req-1" } }), {});
    log.info("after the request");

    expect(parsed()).toEqual([
      { level: 30, context: "lib", route: "test-route", requestId: "req-1", msg: "deep in lib code" },
      { level: 30, msg: "after the request" },
    ]);
  });

  it("passes route params through, adds the requestId, and flushes even when the handler throws", async () => {
    flushLogger.mockClear();
    const GET = withRequestLogContext("test-route", async (_request, context: { params: Promise<{ id: string }> } & { requestId: string }) => {
      return Response.json({ id: (await context.params).id, requestId: context.requestId });
    });
    const failing = withRequestLogContext("test-route", async () => {
      throw new Error("boom");
    });
    const request = new NextRequest("https://example.test/", { headers: { "x-request-id": "req-4" } });

    const response = await GET(request, { params: Promise.resolve({ id: "x" }) });

    expect(await response.json()).toEqual({ id: "x", requestId: "req-4" });
    await expect(failing(request, {})).rejects.toThrow("boom");
    expect(flushLogger).toHaveBeenCalledTimes(2);
  });

  it("layers scoped fields and restores the outer context afterwards", async () => {
    const { log, parsed } = capture();

    await withLogContext({ route: "trpc/user.startFetch", requestId: "req-2" }, async () => {
      await withLogContext({ sessionId: "s-1", region: "intl" }, async () => {
        log.info("inside the fetch");
      });
      log.info("after the fetch");
    });

    expect(parsed()).toEqual([
      { level: 30, route: "trpc/user.startFetch", requestId: "req-2", sessionId: "s-1", region: "intl", msg: "inside the fetch" },
      { level: 30, route: "trpc/user.startFetch", requestId: "req-2", msg: "after the fetch" },
    ]);
  });

  it("doesn't repeat fields a logger already binds", () => {
    const { log, lines } = capture();

    withLogContext({ route: "outer", requestId: "req-3" }, () => {
      log.child({ route: "outer", requestId: "req-3" }).info("bound");
    });

    expect(lines[0].match(/"route"/g)).toHaveLength(1);
    expect(lines[0].match(/"requestId"/g)).toHaveLength(1);
  });

  it("lets call-site fields win over the context", () => {
    const { log, parsed } = capture();

    withLogContext({ region: "intl" }, () => log.info({ region: "jp" }, "explicit"));

    expect(parsed()[0].region).toBe("jp");
  });

  it("keeps concurrent contexts apart", async () => {
    const { log, parsed } = capture();

    await Promise.all(["a", "b", "c"].map((id) => withLogContext({ sessionId: id }, async () => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
      log.info(id);
    })));

    for (const line of parsed()) expect(line.sessionId).toBe(line.msg);
  });
});
