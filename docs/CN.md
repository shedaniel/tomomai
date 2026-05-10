# CN Region WIP Map

## Definition of Done

An item is **only complete** when it validates / iterates regions **dynamically against `getEnabledRegions()` / `isRegionEnabled()`** from `lib/enabled-regions.ts` — not by hardcoded `region === "cn"` / `region !== "cn"` checks, hardcoded triples like `"jp" | "intl" | "cn"`, or hardcoded iteration arrays like `["intl", "jp", "cn"]`.

Region-property branches (e.g. "CN does not use SEGA login, so skip cookie fetch when `region === 'cn'`") are acceptable inside an item, but the item's region **gating / validation / default-set** must be dynamic.

Examples:
- ✅ `if (!region || !isRegionEnabled(region)) return 400`
- ✅ `const regions = regionParam ? [regionParam] : getEnabledRegions()`
- ❌ `if (region !== "intl" && region !== "jp" && region !== "cn")`
- ❌ `const regions = ["intl", "jp", "cn"]`
- ❌ `if (regionParam !== "jp" && regionParam !== "intl")`

This means even items that "support cn today" via hardcoded paths must be revisited.

## Already Done
- [x] **Types/enums**: `lib/types.ts` (`Region`), `lib/db/types.ts` (`REGION_ENUM`), `lib/db/schema-pg.ts` (region columns)
- [x] **Region config**: `lib/enabled-regions.ts`
- [x] **UI shells**: `components/region-switcher.tsx`, `components/token-dialog.tsx` → `token-dialog-cn.tsx`, `settings/fetch-settings.tsx`, `settings/account-settings.tsx` (`isCNExclusive`)
- [x] **Most tRPC user routers** — already use `getEnabledRegions()`
- [x] **CN catalog fetcher**: `server/services/admin/maimai-lxns.ts` (Lxns API, single-source pipeline)
- [x] **Genre normalization for Lxns**: `lib/name-utils.ts` (POPSアニメ / niconicoボーカロイド / オンゲキCHUNITHM / ゲームバラエティ → canonical `＆` forms; region-agnostic)
- [x] **Admin region validation** (the four admin routes below) gate on `isRegionEnabled()` and default iteration to `getEnabledRegions()`:
  - `app/api/admin/update/route.ts`
  - `app/api/admin/db/route.ts` (normalize path; backfill still JP/INTL-only)
  - `app/api/admin/update_all/route.ts`
  - `app/api/admin/upload/route.ts`

## Data Pipeline (core gap)
**Catalog ingestion (functional for CN via Lxns):** the JP/INTL multi-source merge (scraper + base + otoge-db + after-fetch) is replaced for CN by a single `LxnsFetcher` that covers title, artist, genre, cover, level, levelPrecise, bpm, noteDesigner, notes counts, and addedVersion. The JP/INTL-specific files below are skipped entirely for CN — they still need work only if we want CN player-score scraping.
- [ ] `lib/maimai/fetch.ts` — `fetchPlayerData`, `fetchSongsData`, `fetchRecentSongsData`, baseUrl ternaries — score scraping is JP/INTL-only (CN has no scrapable mobile site; will need a different score source)
- [ ] `server/services/maimai-login.ts` — `processMaimaiToken` (L21-40), cookie validation (L87), JP login URLs (L185-186, L295, L300) — CN does not use SEGA login
- [~] `server/services/admin/level-fetcher.ts` — pipeline branches on `region === "cn"`. **Not "done" by definition above.** Should derive the fetcher set from a region→fetcher-set table or per-region capability flag, gated by `isRegionEnabled` upstream. Functionality works today.
- [~] ~~`server/services/admin/maimai-scraper.ts`~~ — currently bypassed for CN via the same hardcoded branch. Same caveat as `level-fetcher.ts`.
- [~] ~~`server/services/admin/maimai-after-fetch.ts`~~ — same caveat.
- [~] ~~`server/services/admin/maimai-base-songs.ts`~~ — same caveat.
- [~] ~~`server/services/admin/otoge-db.ts`~~ — same caveat.
- [ ] `server/utils/level.ts` — CN utage handling: `levelToPrecise` reused for utage; verify CN-specific quirks if any surface

## HTTP API Routes
- [?] `app/api/login/route.ts` — `DEFAULT_REGION` hardcoded `intl` (L11, L32). Skippable for now (intl-only login flow).
- [?] `app/api/login.js/route.ts` — region default `intl` (L19). Skippable (intl-only).
- [x] `app/api/last-credit/route.ts` — gated by `isRegionEnabled`; `prepareCreditData` accepts `Region` (CN will fail at data layer since no scrape source, acceptable region-property branch)
- [x] `app/api/admin/update/route.ts` — gated by `isRegionEnabled`; CN skips token/cookie via region-property branch (acceptable)
- [?] ~~`app/api/admin/fetch/route.ts`~~ — N/A; route handles store data which CN does not have.
- [x] `app/api/admin/db/route.ts` — only `normalize` remains (gated by `isRegionEnabled`); `backfill` / `clear_backfill` removed and the legacy `user_scores` table dropped (migration `0013_quiet_goblin_queen.sql`).
- [x] `app/api/admin/update_all/route.ts` — gated by `isRegionEnabled`; default iteration uses `getEnabledRegions()`
- [x] `app/api/admin/upload/route.ts` — gated by `isRegionEnabled`
- [x] `app/api/admin/import/route.ts` — `from` / `to` parsers accept any `getEnabledRegions()` value; error messages list the dynamic enabled set
- [x] `app/api/admin/image/route.ts` — `extractFilename` now matches Lxns jacket URLs (`assets2.lxns.net/maimai/jacket/{id}.png`) and namespaces them as `lxns_{id}` in R2; route is region-agnostic so no `isRegionEnabled` gate needed

## Pages
- [ ] `app/profile/[username]/[region]/page.tsx` — region name map (L40, L95). Should derive labels from a Region→i18n-key map, gated by `isRegionEnabled`.
- [ ] `app/page.tsx` — default region `intl` (L61, L65). Default should fall back through `getEnabledRegions()`.

## Discord Integration
- [ ] `lib/discord/commands.ts` — descriptions L16/20/24/28/32/36, casts L63/76/89/113; no `profilecn`/`fetchcn`/`recentscn` commands. Command set should be generated per region from `getEnabledRegions()`.
- [ ] `lib/discord/image-utils.ts` — region type L138/147/152, custom button IDs L308/318

## Image / Asset Handling
- [ ] `lib/utils.ts` — domain allowlist L4-5 (no CN domain). Allowlist should depend on enabled regions.
- [ ] `lib/render-image-server.ts` — domain check L64

## i18n (partial)
- [x] `regions.cn` label exists in en.json
- [ ] Missing CN equivalents of `japanDescription` / `intlDescription` (auth/token guidance) across `en.json`, `ja.json`, `zh-CN.json`, `zh-HK.json`, `zh-TW.json`

## Env
- [ ] `NEXT_PUBLIC_ENABLED_REGIONS` must include `cn`

**Biggest WIP areas:** the maimai-fetcher pipeline, login/token service, admin scraper URLs, the admin HTTP routes, and the fetcher pipeline branching — most of these still hard-branch on `jp` vs `intl` (or now on `cn`) rather than going through `getEnabledRegions()` / `isRegionEnabled()`.

**Update (catalog done):** CN catalog ingestion is end-to-end runnable via `GET /api/admin/update?region=cn` (no token needed). Remaining: tackle CN player score data (no SEGA mobile scraping path — likely needs Lxns player API or user-supplied data import), and convert all remaining hardcoded region branches to dynamic enabled-region checks.
