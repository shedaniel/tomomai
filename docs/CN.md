# CN Region WIP Map

## Definition of Done

An item is **only complete** when it validates / iterates regions **dynamically against `getEnabledRegions(game)`** from `lib/games/regions.ts` (or `useGame().regions` in client components) — not by hardcoded `region === "cn"` / `region !== "cn"` checks, hardcoded triples like `"jp" | "intl" | "cn"`, or hardcoded iteration arrays like `["intl", "jp", "cn"]`.

Region-property branches (e.g. "CN does not use SEGA login, so skip cookie fetch when `region === 'cn'`") are acceptable inside an item, but the item's region **gating / validation / default-set** must be dynamic.

Examples:
- ✅ `if (!region || !getEnabledRegions(game).includes(region)) return 400`
- ✅ `const regions = regionParam ? [regionParam] : getEnabledRegions(game)`
- ❌ `if (region !== "intl" && region !== "jp" && region !== "cn")`
- ❌ `const regions = ["intl", "jp", "cn"]`
- ❌ `if (regionParam !== "jp" && regionParam !== "intl")`

This means even items that "support cn today" via hardcoded paths must be revisited.

## Already Done
- [x] **Types/enums**: `lib/games/ids.ts` (`REGIONS`, `Region`), `lib/db/schema-pg.ts` (region columns)
- [x] **Region config**: `lib/games/regions.ts`
- [x] **UI shells**: `components/region-switcher.tsx`, `components/token-dialog/index.tsx` → `components/games/maimai/cn-token-dialog.tsx`, `settings/fetch-settings.tsx`, `settings/account-settings.tsx` (`isGameCnExclusive`)
- [x] **Most tRPC user routers** — validate regions at run time against `getEnabledRegions(game)`
- [x] **CN catalog fetcher**: `server/services/games/maimai/catalog/sources/lxns.ts` (Lxns API, single-source pipeline)
- [x] **Genre normalization for Lxns**: `server/services/games/maimai/catalog/genres.ts` (POPSアニメ / niconicoボーカロイド / オンゲキCHUNITHM / ゲームバラエティ → canonical `＆` forms; region-agnostic)
- [x] **Admin region validation** (the four admin routes below) gate on `getSupportedRegions(game)` and default iteration to the enabled regions:
  - `app/api/admin/update/route.ts`
  - `app/api/admin/db/route.ts` (normalize path; backfill still JP/INTL-only)
  - `app/api/admin/update_all/route.ts`
  - `app/api/admin/upload/route.ts`

## Data Pipeline (core gap)
**Catalog ingestion (functional for CN via Lxns):** the JP/INTL multi-source merge (scraper + base + otoge-db + after-fetch) is replaced for CN by a single `LxnsFetcher` that covers title, artist, genre, cover, level, levelPrecise, bpm, noteDesigner, notes counts, and addedVersion. The JP/INTL-specific files below are skipped entirely for CN — they still need work only if we want CN player-score scraping.
- [ ] `server/services/games/maimai/scores/{player,songs,recents}/fetch.ts` — `extractPlayerData`, `fetchAllSongsData`, `fetchRecentSongsData` (pages resolve against the region's site through the game site client) — score scraping is JP/INTL-only (CN has no scrapable mobile site; will need a different score source)
- [x] `server/services/games/maimai/login.ts`: `openMaimaiLogin` sends CN tokens to the CN providers and never to SEGA login
- [~] `server/services/games/maimai/catalog/pipeline.ts` — pipeline branches on `region === "cn"`. **Not "done" by definition above.** Should derive the fetcher set from a region→fetcher-set table or per-region capability flag, gated by the enabled regions upstream. Functionality works today.
- [~] ~~`server/services/games/maimai/catalog/sources/scraper.ts`~~ — currently bypassed for CN via the same hardcoded branch. Same caveat as `maimai/pipeline.ts`.
- [~] ~~`server/services/games/maimai/catalog/sources/after-fetch.ts`~~ — same caveat.
- [~] ~~`server/services/games/maimai/catalog/sources/base-songs.ts`~~ — same caveat.
- [~] ~~`server/services/games/maimai/catalog/sources/otoge-db.ts`~~ — same caveat.
- [ ] `server/utils/level.ts` — CN utage handling: `levelToPrecise` reused for utage; verify CN-specific quirks if any surface

## HTTP API Routes
- [x] `app/api/login/route.ts`: the region comes from the signed login authorization
- [x] `app/api/login.js/route.ts`: the bookmarklet no longer sends a region
- [x] `app/api/last-credit/route.ts` — gated by `resolveGameContext` against the enabled regions; `prepareCreditData` accepts `Region` (CN will fail at data layer since no scrape source, acceptable region-property branch)
- [x] `app/api/admin/update/route.ts` — gated by `getSupportedRegions`; CN skips token/cookie via region-property branch (acceptable)
- [?] ~~`app/api/admin/fetch/route.ts`~~ — N/A; route handles store data which CN does not have.
- [x] `app/api/admin/db/route.ts` — only `normalize` remains (gated by `getSupportedRegions`); `backfill` / `clear_backfill` removed and the legacy `user_scores` table dropped (migration `0013_quiet_goblin_queen.sql`).
- [x] `app/api/admin/update_all/route.ts` — gated by `getSupportedRegions`; default iteration uses the enabled regions
- [x] `app/api/admin/upload/route.ts` — gated by `getSupportedRegions`
- [x] `app/api/admin/import/route.ts` — `from` / `to` parsers accept any `getSupportedRegions(game)` value; error messages list that set
- [x] `app/api/admin/image/route.ts` — `extractFilename` now matches Lxns jacket URLs (`assets2.lxns.net/maimai/jacket/{id}.png`) and namespaces them as `lxns_{id}` in R2; route is region-agnostic so no region gate needed

## Pages
- [ ] `app/profile/[username]/[region]/page.tsx` — region name map (L40, L95). Should derive labels from a Region→i18n-key map, gated by `isGameRegion`.
- [ ] `app/page.tsx` — default region `intl` (L61, L65). Default should fall back through `getEnabledRegions(game)`.

## Discord Integration
- [ ] `lib/discord/commands.ts` — descriptions L16/20/24/28/32/36, casts L63/76/89/113; no `profilecn`/`fetchcn`/`recentscn` commands. Command set should be generated per region from `getEnabledRegions("maimai")`.
- [ ] `lib/discord/image-utils.ts` — region type L138/147/152, custom button IDs L308/318

## Image / Asset Handling
- [ ] `lib/utils.ts` — domain allowlist L4-5 (no CN domain). Allowlist should depend on enabled regions.
- [ ] `lib/render-image-server.ts` — domain check L64

## i18n (partial)
- [x] `regions.cn` label exists in en.json
- [ ] Missing CN equivalents of `japanDescription` / `intlDescription` (auth/token guidance) across `en.json`, `ja.json`, `zh-CN.json`, `zh-HK.json`, `zh-TW.json`

## Env
- [ ] `NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS` must include `cn` (legacy `NEXT_PUBLIC_ENABLED_REGIONS` is used only when the game-specific variable is unset)

**Biggest WIP areas:** the maimai-fetcher pipeline, login/token service, admin scraper URLs, the admin HTTP routes, and the fetcher pipeline branching — most of these still hard-branch on `jp` vs `intl` (or now on `cn`) rather than going through `getEnabledRegions(game)`.

**Update (catalog done):** CN catalog ingestion is end-to-end runnable via `GET /api/admin/update?region=cn` (no token needed). Remaining: tackle CN player score data (no SEGA mobile scraping path — likely needs Lxns player API or user-supplied data import), and convert all remaining hardcoded region branches to dynamic enabled-region checks.
