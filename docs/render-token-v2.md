# Render Token v2 — Binary Wire Format

The render token carries the **full render payload** (header metadata + score
data) from `apps/main` to `apps/render`, HMAC-signed with `RENDER_TOKEN_SECRET`.
This lets render produce images with **zero database access** — all data rides
the token, and catalog fields (song names, covers, levels) are joined from the
public `/api/v1/songs` CDN-cached endpoint.

A B50 export-image token is ~2KB on the wire — small enough to ride the existing
302 redirect (`?t=<token>`) without a callback, Redis stash, or POST body.

## Envelope

```
message = VERSION || HEADER || ROUTE_PAYLOAD     (raw bytes)
token   = base64url(message) || "." || base64url(HMAC-SHA256(secret, message))
```

- `base64url` = `A-Za-z0-9-_`, **no padding**.
- The entire token is URL-query-safe (the `.` is unreserved) → `?t=<token>`
  needs no encoding.
- HMAC is computed over the **raw binary message** (version byte included →
  authenticated, no downgrade).

## Conventions

| Term | Meaning |
|------|---------|
| `u8` / `u16` / `u32` | unsigned int, big-endian |
| `i16` | signed two's-complement int, big-endian |
| `ascii8` | eight fixed ASCII bytes from the nanoid alphabet |
| `u24` | 3-byte unsigned int, big-endian |
| `L8` | `u8 length` ‖ UTF-8 bytes (strings ≤ 255 bytes) |
| `L8?` | `u8 0` (absent) ‖ `u8 1` + L8 (present) |
| `L16` | `u16 length` ‖ UTF-8 bytes (URLs, ≤ 65535 bytes) |
| Enums | `u8` index into an ordered set |

## Byte layout

### HEADER (common to all routes)

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `version` | u8 | **`0x02`**. If ≠ 0x02 → `unsupported-version`. |
| 1 | `route` | u8 | `0=export-image, 1=last-credit, 2=daily-plays` |
| 2 | `scale` | u8 | `1` or `2` |
| 3 | `exp` | u32 | unix seconds; render rejects if `now > exp` (410) |
| 7 | `gameVersion` | u8 | replaces `metadata.ts` entirely |
| 8 | `region` | u8 | `0=intl, 1=jp, 2=cn` |
| 9 | `rating` | u16 | player DX rating |
| 11 | `displayName` | L8 | UTF-8 (Japanese fullwidth OK) |
| · | `iconUrl` | L16 | maimaidx URL or data URL |
| · | `title` | L8 | |
| · | `titleType` | u8 | `0=normal,1=bronze,2=silver,3=gold,4=rainbow` |
| · | `classRankUrl` | L16 | |
| · | `courseRankUrl` | L16 | |

### ROUTE_PAYLOAD

#### `0 = export-image`

| Field | Type |
|-------|------|
| `visitableProfileAt` | L8? |
| `chartCount` | u8 |
| `charts` | ChartRecord × chartCount |

#### `1 = last-credit`

| Field | Type |
|-------|------|
| `playedAt` | u32 (unix seconds) |
| `trackCount` | u8 |
| `tracks` | TrackRecord × trackCount |

#### `2 = daily-plays`

| Field | Type |
|-------|------|
| `day` | L8 ("YYYY-MM-DD") |
| `playCount` | u8 |
| `plays` | ChartRecord × playCount |

### ChartRecord (export-image + daily-plays)

| Field | Type | Notes |
|-------|------|-------|
| `songId` | ascii8 + i16 | parent ID + version; region inherited from HEADER |
| `achievement` | u24 | 0..1,005,000 |
| `fc` | u8 | `0=none,1=fc,2=fc+,3=ap,4=ap+` |
| `fs` | u8 | `0=none,1=sync,2=fs,3=fs+,4=fdx,5=fdx+` |

**15 bytes.** The chart's `difficulty`, `type`, `levelPrecise`, `level`,
`cover`, `songName`, `addedVersion` are **never in the token** — render joins
them from `/api/v1/songs` by `songId`.

### TrackRecord (last-credit)

| Field | Type | Notes |
|-------|------|-------|
| `songId` | ascii8 + i16 | same fixed 10-byte instance ID as ChartRecord |
| `achievement` | u24 | |
| `fc` | u8 | |
| `fs` | u8 | |
| `dxScore` | u32 | |
| `maxDxScore` | u32 | |
| `hasDetails` | u8 | `0` = dimmed table, `1` = full breakdown below |
| `fastCount` | u16 | only if hasDetails |
| `lateCount` | u16 | only if hasDetails |
| `tap` | NoteCounts | only if hasDetails |
| `hold` | NoteCounts | only if hasDetails |
| `slide` | NoteCounts | only if hasDetails |
| `touch` | NoteCounts | only if hasDetails |
| `break` | NoteCounts | only if hasDetails |

**24 bytes** without details, **78 bytes** with.

### NoteCounts (5 × u16)

`criticalPerfect`, `perfect`, `great`, `good`, `miss` — each `u16` (10 bytes
total per note type).

## Deployment and catalog lookup

Version 2 encodes each song instance in exactly **10 bytes**: eight ASCII
parent-ID bytes and a signed 16-bit game version. Region is inherited from
HEADER; the encoder rejects charts whose region differs from the header. There
is no length prefix or padding. The decoded DTO uses the usual composite string
(for example `Ab3xK9pQ:j14`); its textual length does not affect the wire width.
Negative historical versions use two's-complement encoding. Both encoder and
decoder validate the parent alphabet and region. A chart record is 15 bytes;
50 charts use 750 bytes plus the header before base64url and the signature.

Deploy main and render together: the new decoder rejects v1 tokens and an old
renderer rejects v2 tokens. Previously issued tokens must be regenerated.
The renderer fetches the region/version slices named by the individual chart
IDs, so historical or mixed-version plays resolve to their exact instances.

## Failure semantics

| Condition | HTTP status | reason |
|-----------|-------------|--------|
| `version ≠ 0x02` | 401 | `unsupported-version` |
| HMAC mismatch / malformed | 401 | `bad-signature` / `malformed` |
| `now > exp` | 410 | `expired` |
| `songId` not in catalog | 502 | stale chart (log + fail) |
| Structural underflow in parse | 400 | `malformed` |
