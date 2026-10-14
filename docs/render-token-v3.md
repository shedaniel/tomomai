# Render Token v3: Binary Wire Format

The render token carries the **full render payload** (header metadata + score
data) of one game's image from `apps/main` to `apps/render`, HMAC-signed with
`RENDER_TOKEN_SECRET`. This lets render produce images with **zero database
access**. All data rides the token, and catalog fields (song names, covers,
levels) are joined from the public, CDN-cached `/api/v1/games/{game}/songs`
catalog slices.

A maimai B50 export-image token is ~2KB on the wire, small enough to ride the
existing 302 redirect (`?t=<token>`) without a callback, Redis stash, or POST
body.

## Envelope

```
message = VERSION || GAME || ROUTE || HEADER || ROUTE_PAYLOAD     (raw bytes)
token   = base64url(message) || "." || base64url(HMAC-SHA256(secret, message))
```

- `base64url` = `A-Za-z0-9-_`, **no padding**.
- The entire token is URL-query-safe (the `.` is unreserved), so `?t=<token>`
  needs no encoding.
- HMAC is computed over the **raw binary message**. The version byte is
  included, so it is authenticated and cannot be downgraded.

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

### Prefix

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `version` | u8 | **`0x03`**. If ≠ 0x03 → `unsupported-version`. |
| 1 | `game` | u8 | `0=maimai, 1=chunithm` |
| 2 | `route` | u8 | `0=export-image, 1=last-credit, 2=daily-plays` |

maimai has every route. CHUNITHM has `export-image` (its rating breakdown) and
`daily-plays`. A route the game does not have fails to decode.

### HEADER

Every game's header starts with the same fields:

| Field | Type | Notes |
|-------|------|-------|
| `scale` | u8 | `1` or `2` |
| `exp` | u32 | unix seconds; render rejects if `now > exp` (410) |
| `gameVersion` | u8 | the game's version ID, so render needs no version table |
| `region` | u8 | `0=intl, 1=jp, 2=cn` |
| `rating` | u16 | maimai: DX rating. CHUNITHM: rating ×100, so 17.25 is `1725` |
| `displayName` | L8 | UTF-8 (Japanese fullwidth OK) |
| `iconUrl` | L16 | game site URL or data URL |
| `title` | L8 | |

A maimai header continues with:

| Field | Type | Notes |
|-------|------|-------|
| `titleType` | u8 | `0=normal,1=bronze,2=silver,3=gold,4=rainbow` |
| `classRankUrl` | L16 | |
| `courseRankUrl` | L16 | |

A CHUNITHM header ends after `title`.

### maimai ROUTE_PAYLOAD

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

#### ChartRecord (export-image + daily-plays)

| Field | Type | Notes |
|-------|------|-------|
| `songId` | ascii8 + i16 | parent ID + version; region inherited from HEADER |
| `achievement` | u24 | 0..1,005,000 |
| `fc` | u8 | `0=none,1=fc,2=fc+,3=ap,4=ap+` |
| `fs` | u8 | `0=none,1=sync,2=fs,3=fs+,4=fdx,5=fdx+` |

**15 bytes.** The chart's `difficulty`, `type`, `levelPrecise`, `level`,
`cover`, `songName`, `addedVersion` are **never in the token**. Render joins
them from `/api/v1/games/maimai/songs` by `songId`.

#### TrackRecord (last-credit)

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

#### NoteCounts (5 × u16)

`criticalPerfect`, `perfect`, `great`, `good`, `miss`, each `u16` (10 bytes
total per note type).

### CHUNITHM ROUTE_PAYLOAD

#### `0 = export-image`

The rating breakdown. The charts come from the snapshot's stored rating
selection, so render does not select or rate them again.

| Field | Type |
|-------|------|
| `visitableProfileAt` | L8? |
| `newCount` | u8 |
| `newCharts` | ChunithmChartRecord × newCount, best first |
| `oldCount` | u8 |
| `oldCharts` | ChunithmChartRecord × oldCount, best first |

#### `2 = daily-plays`

| Field | Type |
|-------|------|
| `day` | L8 ("YYYY-MM-DD") |
| `playCount` | u8 |
| `plays` | ChunithmChartRecord × playCount |

#### ChunithmChartRecord

| Field | Type | Notes |
|-------|------|-------|
| `songId` | ascii8 + i16 | as in ChartRecord |
| `scoreValue` | u24 | 0..1,010,000 |
| `comboStatus` | u8 | code |
| `syncStatus` | u8 | code |
| `clearStatus` | u8 | code |
| `rating` | u16 | the chart's rating at this score ×100, so 17.65 is `1765` |

**18 bytes.** The statuses are codes of the CHUNITHM table that
`/api/v1/games/chunithm/codes` serves, and the chart rating rides the token so
render needs no rating formula. Catalog fields are joined from
`/api/v1/games/chunithm/songs` by `songId`.

## Deployment and catalog lookup

Each song instance is encoded in exactly **10 bytes**: eight ASCII parent-ID
bytes and a signed 16-bit game version. Region is inherited from HEADER; the
encoder rejects charts whose region differs from the header. There is no length
prefix or padding. The decoded DTO uses the usual composite string (for example
`Ab3xK9pQ:j14`); its textual length does not affect the wire width. Negative
historical versions use two's-complement encoding. Both encoder and decoder
validate the parent alphabet and region. A maimai chart record is 15 bytes, so
50 charts use 750 bytes plus the header before base64url and the signature.

Deploy main and render together: a v3 decoder rejects v2 tokens and a v2
renderer rejects v3 tokens. Previously issued tokens must be regenerated.
The renderer fetches the region/version slices of the token's game named by the
individual chart IDs, so historical or mixed-version plays resolve to their
exact instances.

## Failure semantics

| Condition | HTTP status | reason |
|-----------|-------------|--------|
| `version ≠ 0x03` | 401 | `unsupported-version` |
| HMAC mismatch / malformed | 401 | `bad-signature` / `malformed` |
| Unknown game or route, or a route the game lacks | 401 | `malformed` |
| `now > exp` | 410 | `expired` |
| `songId` not in catalog | 502 | stale chart (log + fail) |
| Structural underflow in parse | 401 | `malformed` |
