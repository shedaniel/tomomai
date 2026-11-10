# Mobile app plan

## Goal

Build a tomomai mobile app that feels native on each platform without being a wrapper around the web UI. iOS is the primary target and ships first. Android follows from the same business code. The app serves every game the site serves (maimai DX and CHUNITHM today) and signs in against the existing main app with OAuth.

The app is the second consumer of the public API and the OAuth provider, after the userscript. Where the current API or OAuth setup makes the app worse, this plan changes the server instead of working around it. [Server changes](#server-changes) lists them.

Related documents: the game model in [MULTI_GAME.md](MULTI_GAME.md), the site and domain proposal in [plans/multi-domain.md](plans/multi-domain.md), and the integrator guides under `apps/main/content/developer/guides/` (OAuth, rate limits, errors, pagination and regions).

## Decisions

- **Stack: Skip with separate native apps.** The shared business code is one Swift package. The iOS app is SwiftUI and the Android app is hand-written Kotlin with Jetpack Compose. This is the "separate iOS and Android apps" project type in [Skip's project types](https://skip.dev/docs/project-types/), where the model layer is a dual-platform framework and each UI is written natively.
- **Different looks per platform.** iOS and Android do not share a UI. Each follows its platform's conventions, with tomomai's own style on top (see [Design](#design)).
- **iOS first.** Day to day work happens in Xcode on plain Swift. Android is verified continuously but built second.
- **Fallback: Kotlin Multiplatform.** If the spike fails its exit criteria (see [Spike](#spike)), the shared layer moves to Kotlin Multiplatform. KMP's iOS developer experience is the known cost, so it is the fallback and not the default.
- **One app for both games.** maimai DX and CHUNITHM ship in a single binary and store listing, with a brand switch for name, artwork and accent.
- **The app talks only to `tomomai.lol`.** The API, OAuth issuer, consent page, https redirect and app association files are all on `tomomai.lol`, which serves every game's public API. A game domain such as the CHUNITHM site only gets a redirect and association files later, if website links there should open the app.
- **Public clients stay admin-only.** The app signs in as an official native client created by an admin. The server refuses to create a public client for anyone else.

Rejected: React Native or Expo UI (a good option, but TypeScript was not wanted for the shared layer and the custom iOS feel is weaker), Flutter and Compose Multiplatform (one shared UI), Rust with UniFFI (a third language and FFI debugging), and wrapping the web app.

## Non-goals

- No personal API keys, admin tokens, client secrets or upstream service credentials in the app.
- No scraping of web pages and no automation of the official website UI.
- No hidden mobile-only routes. A mobile need becomes a documented, versioned `/api/v1` change that other integrators get too.
- No dependence on online-only page rendering for browsing, search, profile, recents, stats or cached snapshots.
- No game id comparisons outside a game's own folder, mirroring the server rule in [MULTI_GAME.md](MULTI_GAME.md#rules). Capabilities and tables decide behaviour.

## Repository layout

```text
app/
  README.md
  model/                 SwiftPM package, Skip dual-platform framework (no Darwin/ or Android/ folders)
    Package.swift
    Sources/
      TomomaiAPI/        Typed client, rate limit and quota handling, error mapping
      TomomaiAuth/       OAuth, token store protocol, refresh
      TomomaiStore/      SQLite cache and outbox
      TomomaiSync/       Refresh orchestration and staleness
      TomomaiDomain/     Games, regions, codes, models, repositories, observable state
    Tests/
  ios/                   Xcode project and SwiftUI app, depends on model/
  android/               Gradle project and Compose app, consumes exported framework archives
    lib/                 Output of `skip export`, ignored by git
  Tomomai.xcworkspace    Combines ios/ and model/
```

Notes:

- `app/` is separate from the web workspace `apps/*` and `packages/*`.
- Keep generated files, Xcode user state, exported archives and build outputs out of git.
- The model package is created with `skip init --native-model` for Skip Fuse, or without that flag for Skip Lite. The spike picks one (see [Skip posture](#skip-posture)).
- The brand names are tomomai (maimai DX) and tomochu (CHUNITHM). Module names stay neutral on purpose.

## Games, regions and brands

The server serves several games, each with its own regions, capabilities and brand.

| Game | Brand | Regions | Capabilities (from the definitions) |
|---|---|---|---|
| `maimai` | tomomai | `intl`, `jp`, `cn` | catalog, catalog-stats, posts, scores, recents, albums, events, rankings, rating, rating-plate, rating-distribution, plates, and others |
| `chunithm` | tomochu | `intl`, `jp` | catalog, scores, recents, rankings, rating, rating-distribution |

Rules for the app:

- **Capability driven.** A screen exists for a game only when the game offers the capability in the user's region. CHUNITHM has no albums, plates or events, so those tabs must not render for it. Never write `if game == .chunithm`. Read a capability, a table entry or a per-game view type instead.
- **Region is per game.** The dashboard region and the profile main region live per game on the server (`user_game_preferences`). `/api/v1/me` and `/api/v1/me/settings` answer them clamped to the game's enabled regions. The app stores the user's last chosen game and region separately and treats a game with no choice as "first enabled region".
- **Regions can be disabled per deployment.** A game with no enabled region still serves its catalog, and player requests answer 422. The app handles that as an empty player state, not as an error. The app's API host is the `tomomai.lol` deployment, so CHUNITHM player data is available to it only while that deployment enables CHUNITHM regions. Unset `NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS` defaults to `intl,jp`.
- **Codes, not strings.** Difficulty, chart type, combo, sync, clear and title types arrive as integers. `GET /api/v1/games/{game}/codes` is public and serves the table. Codes are append-only, so a newer server may send a key the app does not know. Unknown codes render a neutral fallback and never crash.
- **`details` is per game.** Fields only one game has live in a `details` object named by its `game`. Model it as a tagged union per game and keep each game's decoding in its own folder.
- **One app, two brands.** The app holds both games and switches brand (name, artwork, accent) with the active game. The model layer is game-agnostic and brand is a presentation concern, so a per-brand app stays possible later without touching the model.
- **Where the game table comes from.** Today the app would hard-code ids, regions and capabilities. That duplicates the server's `GameDefinition`. [Server changes](#server-changes) proposes a discovery endpoint, and until it exists a parity test compares the hard-coded table with the OpenAPI document.

## Design

The look is native-like on each platform with tomomai's custom Material 3 Expressive inspired style on top. It is not one shared skin.

- **iOS:** SwiftUI. Use the system navigation stack, tab bar, sheets, context menus, text input, haptics and (where it comes for free) Liquid Glass. Custom surfaces are tomomai's cards, shapes, type and motion drawn in SwiftUI.
- **Android:** Jetpack Compose with Material 3 Expressive (shape morphing, expressive motion schemes, button groups and the other expressive components). Use the system back gesture, edge to edge and dynamic color where the product allows it.
- **Shared spec, not shared components.** Design tokens (color roles, shape scale, type scale, spacing, motion durations and springs) are written once as a spec and implemented twice. The web already has tokens in `packages/ui` (`themes.ts`, `animation-constants.ts`). Whether they can be the source for a generated Swift and Kotlin token file is something the spike checks. Do not copy values by hand if generation is cheap.
- **Per-game theming.** Each game's presentation (labels, colours, grades) comes from the server's `presentation`, which the app mirrors for the tables it needs. Do not hard-code per-game strings in views.
- **Accessibility and Dynamic Type** are requirements on both platforms, not polish.
- **Localisation.** New features ship English-only first and the other locales (`ja`, `zh-CN`, `zh-HK`, `zh-TW`) are translated in a batch afterwards. Build with string catalogs on iOS and resource files on Android from day one so adding a locale is data only. Copy that differs per game is keyed per game, like `apps/main/messages/games/<game>/<locale>.json`.

## App architecture

Local-first data flow, with the shared layer owning everything below the view model:

```text
SwiftUI view or Compose screen
  -> Observable state (shared, from TomomaiDomain)
  -> Repository
  -> Local database
  -> Sync engine
  -> /api/v1
```

Rules:

- UI reads from the local database first. Network responses update local storage.
- Sync failures do not blank existing data.
- Server-authoritative records use server ids and server timestamps.
- Every root row is scoped by `(userId, game, region)`, mirroring the server's rule of scoping game data at its roots. Catalog slices are scoped by `(game, region, gameVersion)`.
- Mutable offline work, if added later, goes through an outbox with idempotent mutation ids.
- Shared observable types must work for both SwiftUI and Compose. Skip documents that `@Observable` types in the model can power both. The spike proves it for hand-written Compose.

## Authentication

### What the server does today

These are facts from `apps/main/src/lib/auth.ts`, `lib/security/oauth-url.ts` and the OAuth guide, and they differ from the earlier plan:

- Every registered app is a **confidential** client. Creation sets `token_endpoint_auth_method: "client_secret_basic"`, and the token endpoint always requires the secret. Public PKCE-only clients and dynamic registration are not supported. The guide tells mobile and SPA apps to exchange codes through their own backend.
- **Redirect URIs must be `https://`**, or `http://` on a loopback host for development. Custom schemes such as `tomomai://callback` are rejected on purpose, in both the tRPC router and a `hooks.before` guard on create and update.
- **PKCE with S256 is mandatory** and `plain` is not supported. `state` is required. The callback carries `iss`, which must equal `https://tomomai.lol/api/auth`.
- Access tokens last 1 hour and refresh tokens 30 days. Refresh tokens **rotate on every use**, and reusing an old one revokes every refresh and access token the user holds for that client, on all of their devices. `offline_access` is required to get a refresh token.
- Internal scopes (for example `snapshot:submit`) can never be requested or granted through OAuth.
- Signed-out users sign in on the consent page itself (`/oauth/consent`), so any sign-in method the site offers works inside the browser session, and the request is not dropped.
- An admin-only `official` flag marks first-party clients and the consent screen shows trust signals for them.
- The installed Better Auth OAuth provider supports `type: "native"` public clients with `token_endpoint_auth_method: "none"` (PKCE always required for them). The restriction is tomomai's choice, not the library's.

### What the app needs

A native app cannot hold a client secret, and it needs a redirect that returns to the app. The options:

| Option | How | Cost |
|---|---|---|
| **A. Official public client (decided)** | Add a server-side way for an admin to register an official `native` client with `token_endpoint_auth_method: "none"`. The app uses PKCE, exchanges the code directly and stores tokens in the Keychain or Keystore. | Server change plus a security review. Public clients never exist outside admin-created official apps, so third parties are unaffected. |
| B. Token exchange proxy | A first-party route holds the secret and exchanges the code, like the userscript. | The secret is still only as safe as the proxy's access control. Without app attestation, the proxy is a public client with extra steps. |
| C. Keep confidential clients and embed the secret | Never. | Unacceptable. |

**Decided: option A, admin-only.** The app's client is an official native client created by an admin, and the server refuses to create a public client for anyone else. The reasons:

- Redirects must be `https://`, so a third-party mobile developer would need verified universal links on their own domain. Public clients are of little use to them until the redirect rules are redesigned.
- A client without a secret can be imitated, so the admin-only `official` badge on the consent screen is what protects users. That mechanism already exists (`assertOfficialAllowed` in the developer router).
- Opening native clients to approved developers later is a policy change if the server keeps `native` a first-class client type. It would also need a redirect rule redesign (custom schemes or loopback ports) and is out of scope here.

The server work is in [Server changes](#server-changes).

### Redirect URI

Because custom schemes are rejected, the redirect is an `https://` URL that opens the app:

- **iOS:** a universal link on a domain the app associates with. `ASWebAuthenticationSession` supports https callbacks on recent iOS versions (iOS 17.4 and later, verify the exact floor during the spike).
- **Android:** an App Link verified through `assetlinks.json`, handled by a Custom Tab flow.
- `tomomai.lol` serves the association files (`apple-app-site-association`, `assetlinks.json`) unlocalized under `/.well-known/`, and the proxy must skip that path. [plans/multi-domain.md](plans/multi-domain.md) already keeps `/.well-known/...` unlocalized, so it needs to name these two files.
- The client registers one redirect, on `tomomai.lol`, for both games. Signing in to CHUNITHM data needs no CHUNITHM domain, because the API and the account are shared.
- The server restricts a native client's redirect URIs to https on an allowlist of hosts and one fixed callback path. The allowlist starts with `tomomai.lol`. Adding the CHUNITHM domain later also needs its own association files, and is only worth it for opening website links in the app (see [Open decisions](#open-decisions)).
- The callback page must be inert. When the app is not installed it only says to open the app, and it never reads, forwards or logs the `code`.
- Each build flavour needs its own client and registered redirect. Universal links need a real HTTPS host, so the development client uses a staging host, never the production `client_id`.
- Loopback `http://` redirects work for desktop development only, not for the phone.

### Flow and storage

```text
GET /api/auth/oauth2/authorize
  ?response_type=code
  &client_id=<official mobile client id>
  &redirect_uri=<registered https redirect>
  &scope=offline_access <scopes>
  &state=<random>
  &code_challenge=<base64url sha256 verifier>
  &code_challenge_method=S256
```

- Validate `state` before exchanging, and validate `iss` when present.
- Exchange at `POST /api/auth/oauth2/token` with `grant_type=authorization_code`, `code_verifier`, `redirect_uri` and `client_id` (no secret under option A).
- Refresh with `grant_type=refresh_token`. Replace the stored refresh token **atomically** after every refresh and never retry a refresh with an old token. Two refreshes in flight at once would revoke the family, so refreshes are serialised per account.
- Store access token, refresh token, expiry, granted scopes and issuer in the platform secure store behind a `TokenStore` protocol. Skip lists Keychain and SQLite among its platform frameworks, and the spike checks they cover this use.
- Revoke through `POST /api/auth/oauth2/revoke` on sign-out.
- Request the narrowest scopes that cover the shipped features. Leave out the sensitive icon scopes and the destructive ones until a feature needs them. `fetch:start` is requested only when in-app fetching ships.
- Scope expansion happens at token creation, so granted scopes can be narrower than requested. The app reads `GET /api/v1/me/scopes` and hides features it was not granted.

## API usage

The roots from before the multi-game namespace (`/api/v1/songs`, `/api/v1/recents` and the others) answer 410 with a `location`. The app only uses the namespaced routes below.

The API host is `tomomai.lol` for every game, because every deployment serves every game's public API and only catalog writes are pinned to a game's own deployment. The namespaced routes are not on `upstream/main` yet. They ship with the multi-game work, so app work before that deploys runs against a local or preview deployment.

Global routes:

| Feature | Endpoint |
|---|---|
| Health check | `GET /api/v1/ok` |
| Profile | `GET /api/v1/me` |
| Granted scopes | `GET /api/v1/me/scopes` |
| Settings and per-game region choices | `GET /api/v1/me/settings` |

Per-game routes under `/api/v1/games/{game}/` (a route exists in the reference only for games that offer its capability):

| Feature | Endpoint |
|---|---|
| Code table (public) | `GET codes` |
| Song catalog slices (public) | `GET songs?region=&gameVersion=`, `GET songs/versions?region=`, `GET songs/{id}` |
| Parent songs | `GET parents` |
| Snapshots | `GET snapshots`, `GET snapshots/latest`, `GET snapshots/{id}` |
| Recent plays | `GET recents` |
| Stats | `GET stats` |
| Albums | `GET albums` |
| Plates | `GET plates` |
| Fetch | `POST fetch`, `GET fetch/status`, `DELETE fetch/token` |

The OpenAPI document is served at `/developer/openapi.json` and is the source of truth for shapes. Whether a Swift client can be generated from it and still transpile or compile for Android is a spike question. If not, the models are hand-written and a test decodes recorded fixtures.

Every authenticated call sends `Authorization: Bearer <access token>`. Errors are `{ error, code? }`, and the codes any route may answer are `API_ERROR_CODES` (`lib/api/error-codes.ts`).

### Catalog

- Slices are public, cacheable and not metered against the user's budget. They are served under the global IP limit.
- The server publishes the catalog to R2 under `catalog/v2/{game}` and the API redirects to it. The app follows redirects and **never hard-codes the R2 location**. A bump of `CATALOG_FORMAT_VERSION` changes the shape, so the app reads the format it supports and degrades to its cache when it sees one it does not.
- Cache per `(game, region, gameVersion)`, validate with HTTP caching, and refresh `songs/versions` first to find slices that changed.
- The same decoding rules as `packages/games/src/catalog-client.ts` apply (validate the `game` field, decode codes through the table).

### Rate limits and quota

Metering is per key and per user. Current Tier I defaults are 80 cost units per 60 seconds per token, 120 per user and 40,000 per month per user, shared across **every key and OAuth token the user owns**. Reads cost 1 or 2, deleting a snapshot costs 10 and starting a fetch costs 40. These numbers can change, so the app reads headers and never hard-codes them:

- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- `X-RateLimit-User-Limit`, `X-RateLimit-User-Remaining`, `X-RateLimit-Cost`
- `X-Quota-Limit`, `X-Quota-Remaining`, `X-Quota-Reset`
- `Retry-After` on 429

Consequences for the app:

- A cold start refreshes the cheap, high-value resources first and defers the rest. Never fan out every endpoint on launch.
- The quota is shared with the user's other apps and scripts, so the app backs off earlier than it must and shows a warning when remaining budget is low.
- Fetch status polling is every 2 seconds or slower.
- On 429 the app waits for `Retry-After` and never spins. A monthly quota error is a distinct, explained state.

### Fetching new scores

Fetching from the game sites runs on the server, and the app only starts and watches it:

- `POST fetch` starts a session for a game and region, and `GET fetch/status` reports it. A fetch needs a stored SEGA token for that game and region, entered on the web through the token dialog (login methods per game and region: for example `sega-cookie`, `sega-account`, `maimai-cn`).
- The app v1 starts a fetch only when a token is already stored. Entering or refreshing the token inside the app is out of scope for v1 (see [Open decisions](#open-decisions)).
- Fetch can be refused for reasons the app must explain: the site's rate-limit lock (`RATE_LIMITED`), a maintenance window, a missing token, or an already running session. The fetch dialog on the web reads the same state, and an app equivalent needs a way to read it without starting a fetch.

## Offline behaviour

Target v1 contract:

- Browse the cached song catalog of every enabled game and region.
- View the last synced profile, recents, snapshots, stats, albums and plates per game and region.
- Search and filter cached songs without a network.
- Show an explicit stale label when data is older than the last successful sync.
- Disable online-only actions while offline instead of failing late.

Local tables, all scoped as described under [App architecture](#app-architecture):

```text
sync_state(scope_key, cursor, last_synced_at)
catalog_slice(game, region, game_version, payload, etag, updated_at)
codes(game, payload, etag, updated_at)
profile(user_id, payload, updated_at)
settings(user_id, payload, updated_at)
snapshot(user_id, game, region, snapshot_id, payload, updated_at)
recent(user_id, game, region, record_id, payload, updated_at)
stats(user_id, game, region, payload, updated_at)
album(user_id, game, region, album_id, payload, updated_at)
plate(user_id, game, region, plate_key, payload, updated_at)
outbox(client_mutation_id, kind, payload, created_at, status)
```

`outbox` exists without any enabled offline mutation in v1.

## Sync strategy

1. First launch after login: fetch profile, scopes, settings and codes, then for the active game and region the latest snapshot, recents, stats and (when the capability exists) albums and plates. Catalog slices for the active game and region follow.
2. Persist each response independently, so a failing endpoint never discards the others.
3. On foreground, refresh the cheap resources first: profile, settings, latest snapshot and recents.
4. Other games and regions load on demand when the user switches, not at launch.
5. Respect 429 and `Retry-After`. Never spin retry loops.

If the existing endpoints prove too chatty, add a documented sync contract (see [Server changes](#server-changes)) instead of per-screen mobile endpoints.

## Feature modules

Each is a tab or screen the shared layer feeds. Game-specific screens sit behind capabilities.

- **Home.** Sign-in state, active game and region, last sync time, quick links, and quota or rate-limit warnings.
- **Songs.** Cached catalog browser with local search and filters (name, artist, genre, version, chart type, level, difficulty). Detail from the cached slice, with parent songs where the game has them.
- **Profile.** Current user from `/api/v1/me`, per-game region, profile visibility, and stale or offline banners.
- **Recents.** Recent plays from the cache with pull to refresh. Empty, unauthorised, stale and offline states are distinct. Per-game `details` render through the game's own view.
- **Snapshots.** Latest summary, history and detail by public id, cached first and refreshed in the background. Rating selection follows the snapshot's stored rating selection from the server, never recomputed differently on the client.
- **Stats.** Rating and distribution views. Chart rendering is isolated behind a small protocol so each platform can use its own chart implementation.
- **Plates (maimai).** Progress and missing songs, with local filtering.
- **Albums (maimai).** List metadata, with images cached separately and the list never blocked on them. Hidden in regions where the capability is withdrawn (maimai albums in China).
- **Fetch.** Start and watch a fetch when a token exists.
- **Settings.** Account and app settings. Writes wait until a feature needs one.

## Platform abstractions

Small protocols in the model package, each with one implementation per platform:

```swift
protocol TokenStore {
    func load() async throws -> StoredTokens?
    func save(_ tokens: StoredTokens) async throws
    func clear() async throws
}

protocol OAuthSessionRunner {
    func authorize(request: OAuthAuthorizationRequest) async throws -> OAuthCallback
}

protocol NetworkReachability {
    var isOnline: Bool { get }
}
```

Expected implementations: iOS uses `ASWebAuthenticationSession` and the Keychain. Android uses a Custom Tab with an App Link, plus encrypted storage backed by the Keystore. Local storage is SQLite on both.

## Skip posture

- Keep all business logic in the model package and keep Apple-only frameworks out of it.
- Skip Fuse compiles Swift natively for Android with the Swift SDK for Android and bridges to Kotlin through generated JNI code. Skip Lite transpiles Swift to Kotlin. Skip's docs recommend Fuse where possible for compatibility with existing Swift code and dependencies. Lite produces plain Kotlin, which is simpler for a hand-written Compose app to consume. The spike decides, and the two modes can be mixed per module.
- `skip export --project model -d android/lib/debug/ --debug` (and `--release`) produces the archives the Android app depends on. Automate it with a script, because the docs describe the export and Gradle sync as manual.
- Building the framework in Xcode builds only the iOS side. The Android build runs when the unit tests run, so CI runs the Skip test target for every model change.
- Transitive Android dependencies of exported libraries must also be declared in the Android app's `build.gradle.kts`, or they fail at runtime.
- Kotlin that has to live in the model goes in `Sources/<Module>/Skip` or `#if SKIP` blocks. Keep it small.

## Spike

A vertical slice on this branch, iOS first and Android second, before committing to the layout above:

1. A Skip compatible `model` package with PKCE login against a development OAuth client, `GET /api/v1/me`, the `codes` table, and one game's catalog slice cached in SQLite.
2. A SwiftUI app that signs in, shows the profile and lists cached songs, and works offline.
3. A hand-written Compose app that consumes the exported framework and shows the same list with live updates from shared `@Observable` state.

**Exit criteria for Skip.** All of these must hold:

- Compose recomposes from shared model state without hand-written glue per property.
- `skip export` plus Gradle consumption is scriptable end to end in CI.
- Token storage, SQLite and a web auth session work on Android through the model's protocols.
- The Android half of the slice took days, not weeks.

**Fallback triggers.** If any criterion fails and the cause is structural (not a bug we can work around), move the shared layer to Kotlin Multiplatform: Kotlin core with Ktor, SQLDelight and kotlinx.serialization, consumed by SwiftUI as a framework. This plan keeps that cheap by writing the model's public API in protocol shaped types and by keeping this document language neutral. Accept the known iOS developer experience cost in return for a more established toolchain.

## Server changes

The app is the second user of the API and OAuth code. These are changes to the server, each a documented improvement that benefits other integrators. Items 1 to 5 unblock and secure login and are implemented on `feat/native-oauth-client`. Items 6 to 9 make the app cheaper and simpler to run and are not implemented yet. Item 10 extends public clients past the app.

1. **Official native OAuth client (implemented).**
   - A separate admin-only `createNativeOAuthApp` procedure in the developer router creates the client through Better Auth's server-only `adminCreateOAuthClient`, with `type: "native"`, `token_endpoint_auth_method: "none"`, `metadata.official: true` and no secret. The user-facing `createOAuthApp` is unchanged and still creates confidential clients only.
   - `hooks.before` guards every client route. The admin route requires the caller to be an admin and the body to be a valid native client (no skip consent, PKCE kept, only the authorization code and refresh grants, redirects restricted as below). The user-facing create and update routes refuse public or non-web clients. Updating a native client cannot change its type, and its redirect URIs stay restricted. The rules are in `lib/oauth-native.ts`.
   - Native redirect URIs must be `https://` on a host in `NATIVE_APP_REDIRECT_HOSTS` (the deployment's own host by default) at exactly `/oauth/app-callback`, with no query or fragment.
   - The installed Better Auth OAuth provider already supports native public clients and requires PKCE for them. There is no schema change.
   - The developer settings dialog has an admin-only Native app switch. A native app shows an Official and a Native badge, has no secret to rotate, and its redirects stay restricted when edited. The OAuth guide's public client paragraph is updated.
2. **Redirect host (implemented).** The one client registers a single redirect on `tomomai.lol`. A game domain joins `NATIVE_APP_REDIRECT_HOSTS` later only if website links there should open the app. See [Authentication](#authentication).
3. **App association files (implemented).** `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` are built from `APPLE_APP_IDS`, `ANDROID_APP_PACKAGE` and `ANDROID_APP_SHA256_FINGERPRINTS`, so debug and release builds differ. Each answers 404 while unconfigured. The middleware already skips `/.well-known`. The multi-domain plan should name both files.
4. **An inert callback page (implemented).** `/oauth/app-callback` is where the sign-in returns when the app did not claim the link. The middleware drops the query when it redirects to the localized page, so the code never reaches the page, and the page sends no referrer and is `noindex`. The code is single use and bound to the PKCE verifier, and the first request URL can still appear in edge request logs.
5. **Refresh token reuse (implemented as a test).** `lib/oauth-refresh-rotation.test.ts` runs Better Auth's OAuth provider with a public client and pins four behaviours: no secret is needed, the PKCE verifier is, every refresh issues a new token, and replaying a used token fails. Replaying also revokes **all** of that user's refresh tokens and opaque access tokens for the client (JWT access tokens live until they expire), which on a shared official client means every device the user signed in on, not one chain. The app serializes refreshes and treats `invalid_grant` as "sign in again". The test uses the library with the options that matter, not tomomai's own auth instance.
6. **Game discovery endpoint.** Add a public `GET /api/v1/games` returning each game's id, the regions the serving deployment enables, its capabilities and the brand essentials. The enabled regions matter because each deployment sets them with its own environment variables. It removes the duplicated game table from every client and lets a new game appear without an app release.
7. **Stable auth error codes.** Today a missing token is a 401 `Missing API key`, while an expired, revoked or wrong token is a 403 `Invalid or expired token` with no code. The app cannot tell an expired access token (refresh) from a revoked one (sign in again). Return 401 with `WWW-Authenticate: Bearer error="invalid_token"` for expired or revoked tokens, keep 403 for a missing scope, and give each case and quota exhaustion a stable `code`.
8. **Conditional requests.** ETag or `Last-Modified` on snapshots and recents, so a refresh costs less when nothing changed. First verify whether a 304 consumes rate limit budget.
9. **Region choices for every game from one host.** `region` in `/api/v1/me` and `profileMainRegion` in `/api/v1/me/settings` answer the choice for the game of the site that receives the request (see the changelog guide). An app that talks only to `tomomai.lol` therefore cannot read the user's CHUNITHM choices. Return the choice per game, or accept a `game` parameter.
10. **Public clients beyond the app.** Today "native" bundles three things: a public client (PKCE, no secret), forced official, and the app link redirect. Only the first is useful outside the app. A second first-party userscript, not marked official, should ship only its `client_id` and need no server of ours. Split it in steps:
    - Split the native switch into a public client switch and the existing Official switch.
    - Give public clients a redirect kind: the app link (today's rule), or an exact https URL on any host. With PKCE, a code that reaches a host the client does not control is useless without the verifier, so the host itself needs no allowlist.
    - Keep public clients admin-only at first. That covers the app and the userscript.
    - Later, open public clients to third parties with the same https rule plus loopback redirects (`http://127.0.0.1:<port>/...`, RFC 8252) for desktop and CLI tools. Check whether Better Auth matches loopback on any port first. Never allow custom schemes: any app can claim one, so an attacker can start a flow with a real app's `client_id` and their own PKCE pair and receive the code. The device authorization grant (RFC 8628) is the alternative for CLIs.
    - Third-party public clients always show the third-party warning, never skip consent, and stay under the per-user limit and the kill switch.

    Notes for the userscript:
    - Its callback can be its own page on `tomomai.lol` (which must keep the query, unlike `/oauth/app-callback`, and load no analytics or third-party scripts), or a URL on the official site where the userscript already runs, read by the userscript itself. The second needs nothing from us.
    - The current userscript already runs PKCE and sends the code to `/api/userscript/token`, which only adds `USERSCRIPT_CLIENT_SECRET`. Anyone holding a code and verifier can call it, so it is a public client in practice. Moving it to a real public client lets that route go.
    - `snapshot:submit` is internal and refused for every OAuth client. A userscript that submits snapshots needs its own design.

Later, and only if needed:

- **Fetch readiness.** The web dialog reads site status (`getSiteStatus`) before a fetch. Expose the same state in the public API so the app can warn about locks and maintenance before spending 40 cost units.
- **Token management for fetch.** `DELETE fetch/token` exists but nothing supplies a token over the API. A submission flow touches how SEGA credentials are handled and needs its own design.
- **A sync contract**, such as a cursor based `GET /api/v1/games/{game}/sync`, only if the app's measured request pattern justifies it.
- **OAuth discovery.** Better Auth's metadata is silenced today because it would advertise disabled routes. Publish a discovery document that lists only what is enabled.

## Error handling

The app handles each of these as its own state, and never erases cached data because a refresh failed:

- signed out
- access token expired and refresh succeeds
- access token expired and refresh fails
- refresh token revoked or reused
- missing required scope
- offline with cache, and offline without cache
- server error with a stale cache, and without one
- rate limited, and monthly quota exhausted
- game or region not enabled (422) and capability not offered
- a newer server shape the app cannot decode (unknown code, catalog format)
- fetch refused: site lock, maintenance window, missing token, session already running

## Testing and CI

- `swift test` on the model for iOS behaviour and the Skip test target for the Android build and behaviour of the same tests.
- Recorded API fixtures for each game and region decode in both platforms, including unknown codes and the `details` union.
- A parity test compares the hard-coded game table and code tables with `/developer/openapi.json` and `GET codes`, and fails when they drift, until the discovery endpoint exists.
- The refresh token handling has tests for rotation, serialisation of concurrent refreshes and failure without data loss.
- UI snapshot tests per platform stay platform specific. There is no shared UI test layer.

## Implementation sequence

1. Spike (see [Spike](#spike)) and server items 1 to 5, which unblock and secure login.
2. `app/` skeleton: model package, iOS app, Android app, export script, CI.
3. Auth, token store, API client with header handling and error mapping.
4. Local database, codes, catalog cache and song search for maimai.
5. Profile, recents, latest snapshot and stats from local first repositories, with sync orchestration and stale and offline UI.
6. CHUNITHM through the same capability driven screens, then albums and plates for maimai.
7. Android UI on the same repositories, screen by screen.
8. Fetch start and status, and the discovery and readiness server work.
9. Locale batch, release builds and store listings.

## Acceptance criteria for v1

- A fresh iOS install signs in through OAuth with PKCE and no client secret, and refreshes after the access token expires.
- The app browses cached songs for both games while offline, and shows last synced profile, recents, latest snapshot and stats.
- A screen appears only when the game offers its capability in the user's region.
- The app never stores an API key, admin token or client secret.
- It handles 401, 403, 422, 429 and offline errors without losing cached data.
- The model's Android build passes its tests in CI and the Android app lists songs from it. The Android UI itself can still be partial.
- It builds and runs from `app/` with documented steps.

## Open decisions

1. **The CHUNITHM domain.** Not needed for v1, since the app only uses `tomomai.lol`. Today it is `chu.tomomai.lol`, while the brand definition says `chu.tomochu.lol` and the multi-domain plan and changelog guide say `tomochu.app`. It matters only if website links on the CHUNITHM site should open the app, and then for a redirect allowlist entry and its own association files.
2. **Development and staging client.** Which staging host and which `client_id` the debug build uses.
3. **Skip Fuse or Lite for the model.** Decided by the spike.
4. **In-app SEGA token entry.** Out of scope for v1. If wanted later, it needs a server design and a look at how SEGA credentials may be handled in a native app.
5. **Token source for the design system.** Generated from `packages/ui` or hand-maintained.
6. **Minimum OS versions.** The iOS floor (17.4 gives https callbacks in `ASWebAuthenticationSession`) and the Android API level.
7. **Widgets and Live Activities.** Native on both platforms and outside the shared layer. Decide whether they are in the first year.
8. **Public clients for third parties.** Whether and when to open them. The redirect rules are sketched in [Server changes](#server-changes) item 10. It waits until someone asks or a known tool needs it.
9. **CHUNITHM fetch through the maimai deployment.** Only catalog writes are pinned to a game's own deployment, so starting a CHUNITHM fetch on `tomomai.lol` should work, but nobody has verified it end to end, including site rate limit locks and the stored token.
