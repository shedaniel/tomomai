# Render Token v1 — Binary Wire Format

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
| `u24` | 3-byte unsigned int, big-endian |
| `L8` | `u8 length` ‖ UTF-8 bytes (strings ≤ 255 bytes) |
| `L8?` | `u8 0` (absent) ‖ `u8 1` + L8 (present) |
| `L16` | `u16 length` ‖ UTF-8 bytes (URLs, ≤ 65535 bytes) |
| `ascii21` | 21 ASCII bytes, fixed width (the `songId`) |
| Enums | `u8` index into an ordered set |

## Byte layout

### HEADER (common to all routes)

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `version` | u8 | **`0x01`**. If ≠ 0x01 → `unsupported-version`. |
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
| `songId` | ascii21 | `songs.publicId`; catalog fields joined by this |
| `achievement` | u24 | 0..1,005,000 |
| `fc` | u8 | `0=none,1=fc,2=fc+,3=ap,4=ap+` |
| `fs` | u8 | `0=none,1=sync,2=fs,3=fs+,4=fdx,5=fdx+` |

**26 bytes.** The chart's `difficulty`, `type`, `levelPrecise`, `level`,
`cover`, `songName`, `addedVersion` are **never in the token** — render joins
them from `/api/v1/songs` by `songId`.

### TrackRecord (last-credit)

| Field | Type | Notes |
|-------|------|-------|
| `songId` | ascii21 | |
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

**35 bytes** without details, **89 bytes** with.

### NoteCounts (5 × u16)

`criticalPerfect`, `perfect`, `great`, `good`, `miss` — each `u16` (10 bytes
total per note type).

## Worked sizes (base64url token, including 43-char signature)

| Route | Raw message | Token URL length |
|-------|-------------|-----------------|
| export-image (B50, normal user) | ~1.47 KB | **~2.0 KB** |
| export-image (reserved profile) | ~1.42 KB | ~1.95 KB |
| last-credit (4 detailed tracks) | ~0.51 KB | ~0.7 KB |
| daily-plays (50 plays) | ~1.47 KB | ~2.0 KB |

Well within modern browser/proxy limits (8KB+). The only "limit" exceeded is the
IE-era 2083-char myth, which nothing modern enforces.

## Future: nanoid(8)

When `songs.publicId` migrates from nanoid(21) to nanoid(8), the token shrinks
by ~650 bytes (B50). This will be a **v2 token** (version byte `0x02`,
`SONG_ID_LEN = 8`). Old v1 tokens are rejected by the new render; no migration.

## Failure semantics

| Condition | HTTP status | reason |
|-----------|-------------|--------|
| `version ≠ 0x01` | 401 | `unsupported-version` |
| HMAC mismatch / malformed | 401 | `bad-signature` / `malformed` |
| `now > exp` | 410 | `expired` |
| `songId` not in catalog | 502 | stale chart (log + fail) |
| Structural underflow in parse | 400 | `malformed` |
