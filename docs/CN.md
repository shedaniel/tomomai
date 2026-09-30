# CN Region WIP Map

## Definition of Done

An item is **only complete** when it validates and iterates regions **dynamically against `getEnabledRegions(game)`** from `lib/games/regions.ts` (or `useGame().regions` in client components), not with hardcoded `region === "cn"` or `region !== "cn"` checks, hardcoded triples like `"jp" | "intl" | "cn"`, or hardcoded iteration arrays like `["intl", "jp", "cn"]`.

Region-property branches (for example "CN does not use SEGA login, so skip cookie fetch when `region === 'cn'`") are acceptable inside an item, but the item's region **gating, validation and default set** must be dynamic.

Examples:
- ✅ `if (!region || !getEnabledRegions(game).includes(region)) return 400`
- ✅ `const regions = regionParam ? [regionParam] : getEnabledRegions(game)`
- ❌ `if (region !== "intl" && region !== "jp" && region !== "cn")`
- ❌ `const regions = ["intl", "jp", "cn"]`
- ❌ `if (regionParam !== "jp" && regionParam !== "intl")`

This means even items that "support cn today" through hardcoded paths must be revisited.

## Already Done
- [x] **Types/enums**: `lib/games/ids.ts` (`REGIONS`, `Region`), `lib/db/schema-pg.ts` (region columns)
- [x] **Region config**: `lib/games/regions.ts`
- [x] **UI shells**: `components/region-switcher.tsx`, `components/token-dialog/index.tsx` (opens `components/games/maimai/cn-token-dialog.tsx` for the `maimai-cn` login method), `components/settings/fetch-settings.tsx`, `components/settings/account-settings.tsx` (`isGameCnExclusive`)
- [x] **tRPC routers**: regions are validated at run time against the served game's enabled regions
- [x] **CN catalog fetcher**: `server/services/games/maimai/catalog/sources/lxns.ts` (Lxns API, single-source pipeline)
- [x] **Genre normalization for Lxns**: `server/services/games/maimai/catalog/genres.ts` (POPSアニメ / niconicoボーカロイド / オンゲキCHUNITHM / ゲームバラエティ to the canonical `＆` forms, region-agnostic)
- [x] **Admin region validation**: the admin routes below check `getSupportedRegions(game)`, and the default iteration uses the enabled regions:
  - `app/api/admin/update/route.ts`
  - `app/api/admin/db/route.ts` (normalize)
  - `app/api/admin/update_all/route.ts`
  - `app/api/admin/upload/route.ts`

## Data Pipeline
**Catalog ingestion (functional for CN through Lxns):** CN replaces the JP/INTL multi-source stages (scraper, base songs, DxData, fallback, otoge-db and after-fetch) with a single Lxns stage that covers title, artist, genre, cover, level, levelPrecise, bpm, noteDesigner, note counts and addedVersion.
- [x] `server/services/games/maimai/scores/providers/sega-scrape.ts` scrapes maimai DX China with the cookies the CN proxy captured (`cn-cookies://`). The page scrapers in `scores/{player,songs,recents}/` resolve against the region's site through the game site client.
- [x] `server/services/games/maimai/scores/score-source.ts`: `acceptToken` admits only the region's login methods, so CN takes only the CN providers' tokens and never reaches SEGA login
- [x] `server/services/games/maimai/catalog/pipeline.ts`: `maimaiCatalogStages(region)` picks the Lxns stage for CN and the SEGA stages otherwise. That is a region-property branch, and `collectCatalog` checks the region against `getSupportedRegions` first.
- [ ] `server/services/games/maimai/catalog/chart.ts`: CN utage constants come from `maimaiLevelPolicy` too. Verify CN-specific quirks if any surface.

## HTTP API Routes
- [x] `app/api/login/route.ts`: the region comes from the signed login authorization
- [x] `app/api/login.js/route.ts`: the bookmarklet no longer sends a region
- [x] `app/api/last-credit/route.ts`: the owner's region is checked by `resolveGameContext` against the enabled regions, and a visitor's comes from the snapshot
- [x] `app/api/admin/update/route.ts`: gated by `getSupportedRegions`. CN needs no source token (`catalogTokenRegions` in the maimai definition)
- [?] ~~`app/api/admin/fetch/route.ts`~~: N/A, the route handles store data, which CN does not have.
- [x] `app/api/admin/db/route.ts`: only `normalize` remains (gated by `getSupportedRegions`). `backfill` and `clear_backfill` were removed and the legacy `user_scores` table dropped (migration `0013_quiet_goblin_queen.sql`).
- [x] `app/api/admin/update_all/route.ts`: gated by `getSupportedRegions`, and the default iteration uses the enabled regions
- [x] `app/api/admin/upload/route.ts`: gated by `getSupportedRegions`
- [x] `app/api/admin/import/route.ts`: the `from` and `to` parsers accept any `getSupportedRegions(game)` value, and error messages list that set
- [x] `server/services/games/maimai/catalog/images.ts`: `extractFilename` matches Lxns jacket URLs (`assets2.lxns.net/maimai/jacket/{id}.png`) and names them `lxns_{id}` in R2. Cover hosting runs inside `update_all` and is region-agnostic, so no region gate is needed

## Pages
- [x] `app/[locale]/profile/[username]/[region]/page.tsx`: region names come from the `regions` messages, and `isGameRegion` gates the route
- [x] `app/[locale]/page.tsx`: the dashboard region falls back through the enabled regions (`getGameRegion`)

## Discord Integration
- [x] `scripts/register-discord-commands.js` builds each command's `region` choices from the enabled maimai regions, and the commands default to the user's maimai region (`lib/discord/region.ts`)
- [x] `lib/discord/image-utils.ts`: images and buttons carry a `Region`

## Image / Asset Handling
- [x] `lib/images.ts`: the image proxy allowlist is the union of every game's `presentation.imageProxyHosts`. No CN host is listed, so add one there if CN images ever need the proxy.
- [ ] `apps/render/src/lib/render-image-server.ts` caches images only from maimaidx.jp and maimaidx-eng.com, so CN images are downloaded on every render

## i18n (partial)
- [x] `regions.cn` label exists in every locale
- [x] `tokenDialog.cnDescription` gives the CN sign-in guidance next to `intlDescription` in every locale except `ko.json`, which falls back to the English text

## Env
- [ ] A CN deployment must list `cn` in `NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS` (the legacy `NEXT_PUBLIC_ENABLED_REGIONS` is used only when the game-specific variable is unset)

**Remaining WIP areas:** CN utage constants, render image caching and a CN deployment's environment. CN player scores come from the CN proxy's captured session or the Lxns and Diving-Fish providers.

**Update (catalog done):** CN catalog ingestion runs end to end through `GET /api/admin/update?game=maimai&region=cn` (no token needed).
