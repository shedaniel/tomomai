# Logging

This project uses [pino](https://getpino.io) for structured logging, with optional shipping to Axiom and/or Logtail.

## Quick start

```ts
import { logger } from "@/lib/logger";

logger.info("hello world");
logger.info({ userId, snapshotId }, "snapshot loaded");
logger.warn({ retries: 3 }, "upstream slow, retrying");
logger.error({ err }, "failed to render image");
```

Always prefer structured fields over string interpolation — fields are queryable in Axiom; embedded strings are not.

```ts
// 👍 good — `userId` is a field you can filter/group by
log.info({ userId }, "user signed in");

// 👎 bad — `userId` is buried in the message string
log.info(`user ${userId} signed in`);
```

## Field naming conventions

Axiom (and Logtail) charge by unique field count, and queries assume consistent names. **Use the canonical names below — don't invent synonyms.** If a name you need isn't listed, pick a short `camelCase` noun and add it here.

### Canonical field names

| Field            | Use for                                                            | Don't use                                  |
|------------------|--------------------------------------------------------------------|--------------------------------------------|
| `msg`            | The human-readable log message (set automatically by pino).        | `message`, `text`, `description`           |
| `level`          | Log level (set automatically).                                     | `severity`, `lvl`                          |
| `_time`          | Timestamp (set automatically by the Axiom transport).              | `timestamp`, `ts`, `time`                  |
| `err`            | An error object, with `{ message, stack }` extracted.              | `error`, `errorMessage`, `exception`, `e`  |
| `requestId`      | Per-request correlation id (`nanoid(10)`).                         | `reqId`, `request_id`, `traceId`           |
| `route`          | Route identifier (e.g. `"export-image"`, `"admin/update"`).        | `path`, `endpoint`, `handler`              |
| `userId`         | Internal user id.                                                  | `user`, `uid`, `user_id`                   |
| `snapshotId`     | Public snapshot id.                                                | `snapshot`, `snap_id`                      |
| `region`         | `"intl"` / `"jp"` / `"cn"`.                                        | `country`, `locale`                        |
| `durationMs`     | Elapsed time in milliseconds (number).                             | `duration`, `elapsed`, `tookMs`, `ms`      |
| `count`          | A count of something (specify what in `msg`).                      | `total`, `n`, `num`                        |
| `size`           | Byte size (number).                                                | `bytes`, `length`, `len`                   |
| `url`            | A URL relevant to this log line.                                   | `link`, `href`, `uri`                      |
| `status`         | HTTP status code or job status string.                             | `statusCode`, `code`, `httpStatus`         |
| `via`            | Provenance tag (currently `"console"` for bridged calls).          | `source`, `from`                           |

### Rules of thumb

1. **`camelCase`, never `snake_case` or `kebab-case`.** Pino emits camelCase; matching it avoids duplicate logical fields.
2. **One concept, one name.** If you log an error, it's `err`. Always. Not `error` once and `err` somewhere else.
3. **Units in the name when ambiguous.** `durationMs`, `sizeBytes`, `timeoutSec` — never just `duration` / `size` / `timeout`.
4. **Don't put values into field names.** `userId: "u_123"` ✓, `user_u_123: true` ✗. Field cardinality matters; values are free.
5. **Don't repeat the message in fields.** `log.info({ snapshotId }, "loaded snapshot")` is right. `log.info({ snapshotId, msg: "loaded snapshot" }, "...")` duplicates.
6. **Prefer numeric fields for things you'll aggregate.** `durationMs: 153` (number), not `"153ms"` (string) — Axiom can't `avg()` strings.
7. **Add new context via `logger.child(...)`** when it applies to many lines, instead of repeating the field on every call.

## Per-request correlation id (`requestId`)

Every request gets a `requestId` **automatically**. `middleware.ts` generates one
(`nanoid(10)`, or honors an inbound `x-request-id` from a tracing proxy) and:

- forwards it to the route handler as the **`x-request-id` request header**, and
- echoes it on **every response** as the `x-request-id` response header.

So you never have to generate one yourself, and clients can always read
`x-request-id` off the response to quote in a bug report. To tie it to your logs,
build the per-request child logger with the `requestLogger` helper — it reuses the
header id so middleware, route logs, and the response header all share one value:

```ts
import { requestLogger } from "@/lib/request-logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // `log` is logger.child({ route, requestId }); pass extra request-scoped
  // context as a third arg (e.g. { userId }). Add region/version later with
  // `log = log.child({ region })` once you've parsed them.
  const { log, requestId } = requestLogger(request, "your-route-name");

  log.info("starting request");

  try {
    // ... do work, using `log` everywhere instead of `logger` ...
    // The x-request-id response header is set by middleware; include requestId
    // in the JSON body too so it survives logging/copy-paste of the payload.
    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    log.error({ err: error }, "request failed");
    return NextResponse.json({ error: "Internal Error", requestId }, { status: 500 });
  }
}
```

> Note: a cached/static response keeps the `x-request-id` of the request that
> populated the cache — it's most meaningful on dynamic (API) responses.

Reference implementations: `src/app/api/admin/update_all/route.ts`,
`src/app/api/admin/upload/route.ts`, `src/app/api/admin/update/route.ts`.

### Why a child logger?

`logger.child({ requestId, route })` returns a logger that prepends those fields to **every** log line, including ones emitted by helpers it's passed to. Pass `log` (not `logger`) into downstream functions so their logs inherit the same context — that's how a single Axiom query like `route == "export-image" AND requestId == "abc123"` reconstructs the entire request timeline.

## Levels

| Level   | Use for                                                              |
|---------|----------------------------------------------------------------------|
| `trace` | Verbose diagnostic output you'd only want when actively debugging.   |
| `debug` | Information helpful while developing or investigating an incident.   |
| `info`  | Normal operational milestones (request started/finished, job ran).   |
| `warn`  | Recoverable problem (retried request, fell back to default).         |
| `error` | A request/job failed; user-visible impact or unexpected exception.   |
| `fatal` | The process can't continue. Rare.                                    |

Default level is `trace` in dev and `info` in prod (override with `LOG_LEVEL`).

## Logging errors

Always pass the error as a field, not as the message, so the stack and properties are preserved:

```ts
} catch (err) {
  log.error({ err }, "image render failed");
}
```

If you need to log a stack but `err` might not be an `Error`:

```ts
log.error(
  { err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
  "...",
);
```

## Unhandled errors are logged automatically

`instrumentation.ts` exports an `onRequestError` hook that fires for **every**
uncaught error thrown by a route handler, server component, or server action. It
logs the error with the request's `requestId` (set by middleware), so even a
route with no try/catch of its own produces a correlated `error`-level line in
Axiom — query `msg == "Unhandled request error"`.

A per-route `try/catch` + `log.error({ err }, "...")` is still worth it when you
want a **friendly response body** (e.g. include `requestId` in the JSON) or
route-specific context — but you no longer need one *just* to make the failure
observable.

## `console.*` calls

`logger.ts` installs a global bridge that forwards `console.log/info/warn/error/debug/trace` to the shipping streams (Axiom / Logtail) tagged with `via: "console"`. This means existing `console.log(...)` calls in legacy code still get shipped.

That bridge is a safety net, **not** the recommended path. New code should use `logger`/`log` directly because:
- `console.log` can't attach structured fields (no `requestId`, no `userId`, etc.).
- The bridged message is a flat string concatenation — much harder to query.
- Pretty-print local output is duplicated for `console` calls in dev (original + bridged copy via shipping).

When you touch a file with `console.*` calls, replace them with `log.info(...)` etc.

## Configuration

Set in `.env.local`:

| Variable             | Effect                                                        |
|----------------------|---------------------------------------------------------------|
| `LOG_LEVEL`          | Minimum level emitted (`trace` / `debug` / `info` / `warn` / `error`). |
| `AXIOM_TOKEN`        | Axiom advanced API token with **Ingest** capability for the dataset. |
| `AXIOM_DATASET`      | Axiom dataset name. Logs only ship if both token and dataset are set. |
| `AXIOM_URL`          | Override host (default `api.axiom.co`; use `api.eu.axiom.co` for EU). |
| `DEV_LOGTAIL_SOURCE_TOKEN` | Logtail source token (legacy / optional alternative).   |
| `INGESTING_HOST`     | Custom Logtail ingest host.                                   |

Both Axiom and Logtail can be active simultaneously.

## Runtime notes

- `logger.ts` is imported by `src/middleware.ts`, which runs on the **edge runtime**. The edge logger is a bare pino instance with no shipping — middleware logs do **not** reach Axiom. Don't statically import Node builtins (`stream`, `fs`, …) at the top of `logger.ts`; use lazy `require()` inside non-edge code paths.
- In serverless / short-lived invocations, call `await flushLogger()` before responding if you must guarantee delivery — the Axiom buffer otherwise drains on a 1-second timer or at 100 events.
- The Axiom transport disables itself after 5 consecutive failures (logged to stderr) so a broken endpoint can't lock up the app.

## Querying

In Axiom, useful starting points:

```
['tomomai']
| where route == "export-image"
| where requestId == "abc123def0"
| sort by _time asc
```

```
['tomomai']
| where level in ("error", "fatal")
| summarize count() by route, bin_auto(_time)
```
