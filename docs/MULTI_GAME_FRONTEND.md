# Multi-game frontend plan

Status: frontend foundation and per-process game selection implemented, 2026-09-25. This document records agreed
product behavior, the current implementation, and the remaining rollout sequence.
It does not enable CHUNITHM or authorize a production rollout. Backend context is in [MULTI_GAME_BACKEND.md](MULTI_GAME_BACKEND.md)
and catalog identity context is in [PARENT_SONG.md](PARENT_SONG.md).

## Current implementation

The current phase deliberately excludes the two-domain/URL setup and cross-domain
login. Existing maimai URLs remain unchanged. `getFrontendGame()` resolves the configured canonical game at the server boundary
and passes a serializable descriptor through `GameProvider`.
There is no new public game route, hostname rewrite, game switcher, authentication
flow, or CHUNITHM activation in this phase. Domain routing remains a later task.

Implemented frontend support:

- Dashboard, profile and catalog entry points use the same game-aware query
  pipeline for every game, including maimai. Query inputs require the canonical
  game schema; the current-site resolver is the default-game boundary. Canonical
  function names do not need a `ForGame` variant or an implicit maimai fallback.
  Shared layouts retain maimai's rich feature panels through presentation
  adapters and capability checks. Snapshot selection and query keys include
  game and region.
- Generic player views format numeric score/rating/status values, select the
  correct ranking buckets, and provide searchable score tables. CHUNITHM uses
  integer scores and B20/B30; maimai retains percentage scores and B15/B35.
- Public profiles resolve users within game context, load reserved accounts
  through the maimai adapter, and whitelist serialized snapshot fields. Privacy
  filtering removes non-public scores, score details and play counts on the
  server before data reaches client components.
- Catalog list/detail components use game-aware queries and numeric chart codes.
  Detail links use canonical parent/instance identities rather than song-name
  matching. Existing maimai slugs, filters and detail navigation are preserved.
- Shared shell branding, region choices and metadata derive from game context.
  Tomochu's Japanese name is **ともチュウ**. Copy belongs to its existing feature
  namespace instead of a catch-all multi-game translation namespace.
  Maimai profile image queries explicitly filter the game; maimai-only image and
  database surfaces do not render another game's records using maimai semantics.
- Version data lives with each game adapter. Shared version lookups require game
  and region, and the old metadata module only re-exports maimai compatibility
  data for specialized consumers. Public profile invalidation takes explicit game
  context and does not invalidate the current site's pages for another game.

CHUNITHM remains disabled and its providers are still unimplemented. Its frontend
presentation is exercised with fixtures, not live CHUNITHM records. The local
CHUNITHM frontend renders a branded unavailable state before dashboard
authentication or player-data loading. Selecting CHUNITHM does not enable its
providers, regions or capabilities. Existing maimai login/session behavior is unchanged.

Maimai's rich recommendations, percentiles, plates, render/export controls,
reserved accounts and fetch settings remain specialized. Game-specific source
availability and capability checks protect the generic surfaces; this phase does
not promise a fully operational CHUNITHM fetching experience.

Validation includes frontend typechecking, numeric presentation and ranking
fixtures, catalog identity fixtures, public-profile privacy fixtures, and
read-only smoke checks against the existing maimai development server. Domain
isolation, cross-domain authentication and live CHUNITHM acceptance checks below
remain outstanding.

## Per-process development setup

`FRONTEND_GAME` accepts exactly `maimai` or `chunithm`, using the canonical game
schema. Omission defaults to maimai at the central configuration boundary;
empty, misspelled or otherwise invalid values fail startup explicitly. Restart
the process to change the selected game. This setting changes frontend context,
branding and game-scoped data selection without changing public paths or adding
a game switcher.

Run these commands in separate terminals from the repository root:

```sh
FRONTEND_GAME=maimai PORT=3000 pnpm --filter @tomomai/site dev
FRONTEND_GAME=chunithm PORT=3001 pnpm --filter @tomomai/site dev
```

Use `PORT` rather than appending `--port` to the existing piped dev script.
Maimai keeps `.next`; CHUNITHM uses `.next-chunithm` in development, isolating
Next's locks, generated output and caches. Both generated type directories are
included in the app tsconfig. The ignored `next-env.d.ts` may reference whichever
process started last; both processes generate the same route declarations.

The game is fixed in Next configuration for each build. Set `FRONTEND_GAME` at
build time and use the same value when starting that build. Production output
remains `.next`; build each game's production artifact separately, not
concurrently in one checkout.

The two localhost ports are a frontend preview, not domain/session isolation:
browser cookies are shared across localhost ports. Domain routing and secure
cross-site login remain deferred. CHUNITHM still has no configured provider or
regions; its unavailable page is intentional and no backend activation occurs.

## Confirmed decisions

- Each public domain selects exactly one game: `tomomai.lol` is maimai and
  `tomochu.app` is CHUNITHM. Neither domain exposes a game segment in page URLs.
- Public routes remain locale-first, `/{locale}/...`. Existing maimai URLs
  remain valid without a migration redirect.
- Region behavior stays unchanged. Do not add region segments to dashboard or
  catalog URLs; retain existing profile region routes and selection behavior.
- Switching games switches domains and preserves the equivalent page where
  possible. Game-specific records do not automatically have an equivalent.
- CHUNITHM remains hidden until usable, including in the public game switcher.
- Both sites use the same accounts and backend. Different sessions do not mean
  different accounts or separate player identities.
- Login is hosted on `tomomai.lol`, but creates an application session only on
  the requesting site. A fresh Tomochu login must leave Tomomai logged out.
- Sign out affects the current site's session only. It must not immediately
  trigger an automatic cross-site sign-in.

The earlier proposal for public `/{locale}/{game}` URLs is superseded. Explicit
internal game routing remains an implementation option.

## Public routes

The paths below apply on each game's domain. Availability is subject to that
game's capabilities. Preserve current slugs, query parameters and navigation
behavior when migrating maimai.

| Surface | Public path | Scope and behavior |
| --- | --- | --- |
| Dashboard | `/{locale}` | Current domain's game; preserve supported `?tab=...` navigation |
| Database landing | `/{locale}/db` | Current game's available catalog sections |
| Song catalog | `/{locale}/db/songs` | Current game; existing region selection behavior |
| Song detail | `/{locale}/db/songs/{slug}` | Resolve the slug within the current game |
| Public profile | `/{locale}/profile/{username}` | Preserve existing region resolution behavior within the game |
| Regional profile | `/{locale}/profile/{username}/{region}` | Explicit region retained, validated for the game |
| Settings entry | `/{locale}/settings` | Currently redirects to `/settings/account`; final placement remains open |
| Account settings | `/{locale}/settings/account` | Shared account data; central versus branded placement remains open |
| Privacy settings | `/{locale}/settings/privacy` | Audit existing global settings before introducing game-specific overrides |
| Fetch settings | `/{locale}/settings/fetch` | Game-specific controls and supported fetch features |
| Connected applications | `/{locale}/settings/applications` | Account-wide grants; placement remains open |
| Developer settings | `/{locale}/settings/developer` | Account-wide keys/clients; placement remains open |

Current `db/stats`, `db/events`, `db/arcades` and `db/posts` surfaces need an
explicit inventory: some content may be shared, while metrics and events may
be game-specific. Do not duplicate everything onto Tomochu by moving a folder.
Song detail uses both the normal `[type]/[slug]` route and the parallel `@detail`
slot today; preserve list state, direct navigation and browser back behavior.

Truly global surfaces need their own policy, outside the game page rewrite:

- Keep `/api/...`, `/.well-known/...`, static assets and framework assets
  unlocalized. The existing API keeps `/api/v1/games/{game}/...`; a frontend
  domain rule does not remove API game identity or change client contracts.
- Authentication callbacks and authorization endpoints are infrastructure,
  even when a localized login screen surrounds them. Assign each an explicit
  host and callback registration; do not run them through generic page rewrites.
- `/tos` and `/privacy` are currently locale-independent. Recommend one canonical
  policy source covering both brands, with links from both sites. Final hosting
  and product wording require confirmation.
- Recommend keeping developer documentation at `tomomai.lol/{locale}/developer`
  because it describes the shared API. Existing userscript and CN proxy routes
  keep their compatibility behavior until separately designed.
- Maintenance, errors, robots, sitemap and metadata must resolve the correct
  site even though they are not ordinary game-content pages.

## Domain resolution and internal routing

Recommended architecture: one application, a small explicit site configuration,
shared components, and server-resolved game context. Domain mapping belongs in
one module together with brand name, canonical origin and configured aliases.
Do not derive a game from a string suffix, arbitrary host input or client state.

A candidate internal tree is `app/[locale]/[game]/...`. For example:

| Public request | Internal destination |
| --- | --- |
| `tomomai.lol/ja/db/songs` | `/ja/maimai/db/songs` |
| `tomochu.app/ja/db/songs` | `/ja/chunithm/db/songs` |

This is a rewrite, not a browser redirect. Confirm Next.js parallel routes,
RSC requests, prefetches and on-demand ISR work before committing to the tree.
Shared account/legal/developer routes need not live under `[game]` just because
game pages do. Middleware must preserve current security headers, request IDs,
maintenance handling, locale negotiation and API cookie exclusions.

Production host resolution must use an explicit allowlist. Only honor forwarded
host/protocol headers from the configured trusted proxy boundary. Reject unknown
hosts, and overwrite any externally supplied internal game-context header.
Validate that internal game params agree with the resolved site. Requests that
manually include an internal game segment must not expose another game on the
wrong domain; recommend returning 404 for these unpublished paths.

Maimai is the default for the existing site, not a fallback for arbitrary
production hosts. Configure existing `cn.tomomai.lol` behavior explicitly,
including its auth-cookie/proxy relationship, rather than silently breaking it.

For development, keep `localhost:3000` mapped to maimai for compatibility and
configure a second explicit local hostname for CHUNITHM. Prefer distinct hosts
with local HTTPS for auth verification: different ports on localhost do not
isolate cookies by port. Preview hosts must map to a chosen game through trusted
deployment configuration; they should be noindex and use registered test auth
callbacks. Never redirect preview authentication into production by accident.

## Links, game switching and SEO

Introduce a typed public URL builder taking site/game, locale, route and
supported parameters. Internal route segments must not appear in generated
links. Use this boundary for navigation, redirects, metadata, email links,
share links and image URLs. Keep same-site navigation compatible with
`next-intl`; cross-site switching is a full navigation to an allowlisted origin.

Recommended switch behavior, pending confirmation of the fallback choices:

| Source | Destination |
| --- | --- |
| Dashboard/catalog | Equivalent page on the other domain |
| Profile | Same username and region when supported; show that game's empty profile if no records exist |
| Song detail | Other game's catalog; never infer song equivalence from a slug/name |
| Unsupported feature | Other game's dashboard with brief explanatory feedback |
| Shared settings | Equivalent settings page if replicated; otherwise its chosen central location |

Carry locale and only allowlisted, meaningful query state. Do not carry snapshot
IDs, song IDs, authorization parameters or unrelated filters across games. If
the region is unsupported on the destination, use its established region
selection flow instead of inventing a new URL segment or silently mixing data.

Use the canonical game domain for page canonicals, Open Graph URLs, structured
data and sitemap entries. `hreflang` links connect translations of the same
page in the same game; CHUNITHM is not a translation of maimai. Generate separate
site sitemaps and robot policies, preserving legitimate maimai URLs. Shared
content should have one chosen canonical rather than competing copies. Audit
current `resolveBaseUrl`, `resolveBaseUrlFromHeaders`, `seo.ts`, root layout and
sitemap code: a single deployment-level origin is insufficient for two brands.

## Game context and presentation

Resolve a serializable site/game descriptor on the server and provide it to
client components. Keep source adapters and server-only registry dependencies
out of client bundles. Client navigation must not mutate game identity without
a domain change.

Pass game explicitly through page loaders, tRPC calls, query keys, hydration,
server caches, static generation and revalidation. Include region/version/user
where the existing data contract requires them. Ensure that requesting the same
public path on two domains cannot reuse the other game's HTML, RSC payload or
cached metadata. CDN origin separation alone does not isolate application caches.
Map publication invalidation to internal game-specific pages and data tags.

Use the current parent-song dictionary and region/version instances with
per-game catalog slices. Preserve parent/instance IDs and ambiguity protection.
Do not return to the old flattened catalog model or join records by display name.

Migrate the existing maimai UI without changing its score meaning. Extract
presentation contracts for score units/precision, secondary scores, rating,
difficulty labels/colors, chart types, combo/sync/clear statuses and ranking
bucket labels/sizes. Raw generic database fields are not player-facing copy.
Do not assume B15/B35, achievement percentages or DX scores apply to CHUNITHM.

Capabilities govern navigation and components, while the backend continues to
enforce them. Plates, percentile/recommendation calculations, reserved accounts,
credit/daily-play images and existing render-token flows remain maimai-only
until separately adapted. Reuse supported common views rather than displaying
maimai labels on unsupported CHUNITHM data.

Keep the compact existing layout and theme system. Brand descriptors provide
Tomomai/Tomochu names, metadata and assets; exact Tomochu artwork/colors remain a
separate design choice. The game switcher should be keyboard accessible, name
the destination clearly and distinguish game from language/region controls.
Show distinct states for no imported records, unsupported feature, unavailable
source, expired login and a fetch error. Do not display a misleading zero score.
CHUNITHM fixtures belong only in tests/internal development, not public routes.

## Authentication and site-local sign out

### Required behavior

A browser with neither site's session starts sign-in on Tomochu:

1. Tomochu creates a bounded login transaction and redirects to a dedicated
   authorization flow hosted on Tomomai.
2. The user authenticates there. Temporary transaction cookies are allowed,
   but no maimai application session or persistent central SSO session is issued.
3. The flow returns a short-lived, single-use authorization code to the exact
   registered Tomochu callback.
4. Tomochu redeems it server-side and establishes its own application session.
5. Tomochu is signed in; visiting Tomomai still shows a signed-out account.

When a valid maimai session already exists, authorization may reuse it without
creating another session or refreshing its expiry solely because of transfer.
The destination keeps its independent session lifetime. Existing sessions must
not be overwritten to satisfy another site's login transaction.

Use a maintained, reviewed OAuth/OIDC authorization-code implementation with
PKCE, transaction state, exact callback validation and appropriate issuer,
audience and nonce checks. Do not put application session tokens in URLs.
Callbacks and transaction responses must not be publicly cached; avoid logging
codes or tokens. Complete/cancel/expired flows must clean up temporary state.
First-party account matching must use verified immutable identity, not an
unverified email or display name.

Sign out revokes the current site's server session, clears that site's cookie
and resets its client-side authenticated caches. It leaves the other site's
session intact. Public browsing after logout does not trigger authorization;
returning to Tomomai after a Tomochu-only login also does not silently sign in.
A fresh explicit sign-in or game-switch action may initiate authorization.

### Feasibility gate before implementation

The repository currently uses Better Auth and `@better-auth/oauth-provider`
1.6.11 (package ranges and lockfile), backed by the shared Drizzle adapter.
`apps/main/src/lib/auth.ts` configures the provider with `loginPage: "/"`,
Discord/Twitter sign-in, passkeys, trusted origins and optional cross-subdomain
cookies. `auth-client.ts` exposes the ordinary Better Auth sign-in/sign-out
client. The current session table has no explicit site binding.

This is useful existing infrastructure, but it does not establish that the
required authentication-without-maimai-session flow is supported. An initial
library spike must establish:

- A supported way to authenticate a login transaction and issue a destination
  authorization result without issuing a maimai app session. Ordinary login
  followed by deleting its cookie/session is not an acceptable shortcut.
- How to distinguish transaction credentials from app credentials and enforce
  site ownership during session creation, validation, refresh and revocation.
  Separate cookie domains alone do not establish server-side session audience.
  Choose a supported site-binding mechanism after the spike; do not assume a
  new database column is mandatory or that current tokens already enforce it.
- Whether reading an existing session during authorization triggers automatic
  refresh, and how to prevent transfer-only extension of its lifetime.
- How first-party authorization fits the existing provider scopes, consent,
  audience configuration and disabled endpoints without widening third-party
  client privileges or weakening existing security/policy/freshness checks.
- How cancellation, concurrent tabs, returning users and a destination already
  signed in as another account behave. Recommend explicit account-switch
  confirmation rather than silently replacing a different account's session.

Passkeys are currently bound to the maimai registrable domain. Keeping the login
ceremony on Tomomai can preserve those credentials; they cannot simply be used
at Tomochu's origin. Validate the existing RP ID/origin setup and social callback
registrations for every supported deployment, including the CN proxy.

The goal is a standard, maintained auth flow, not a bespoke protocol. If the
installed library cannot separate authentication and session issuance, report
the limitation and choose a supported integration/library change before
implementing the cross-site feature. Do not silently relax the user's session
requirements. Seamless reverse transfer from a Tomochu-only session back into
Tomomai remains an open product/architecture question, not a requirement.

## Implementation sequence

1. **Resolve the remaining product choices and run the auth spike.** Record the
   supported library approach and session behavior before coupling it to UI.
   Route/context work can proceed in parallel with this bounded investigation.
2. **Introduce site context and URL builders.** Configure hosts, isolate caches,
   prototype internal rewrites, update locale/SEO plumbing and preserve existing
   maimai URLs. Keep CHUNITHM publicly unavailable.
3. **Migrate maimai surfaces.** Thread explicit game through catalog, dashboard,
   profiles, settings, hydration and metadata. Preserve all current semantics;
   extract presentation contracts and capability checks with internal fixtures.
4. **Implement destination-only login and local logout.** Integrate the selected
   maintained flow; verify two real browser origins before enabling Tomochu.
5. **Complete Tomochu presentation and launch gates.** Connect real providers,
   enable supported views, finalize branding, publish catalog slices, register
   production hosts/callbacks and expose the cross-domain switcher together.

Frontend domain routing alone should not require a schema migration. If the
auth spike identifies one, follow AGENTS.md's notification/reset/generation
rules in that later task. Never apply migrations from this workflow. No schema
change, domain configuration or deployment is part of the current frontend phase.
Roll out routing changes with maimai regression verification first. Keep a
feature switch for cross-domain login/navigation so it can be disabled without
undoing the working maimai pages; do not remove active session infrastructure
until its sessions have been safely retired.

## Acceptance checks

- Existing maimai deep links, query tabs, locale redirects, profile region
  behavior and song detail/back navigation work unchanged.
- The same public path on each domain resolves its own game under cold/warm
  cache, prefetch, RSC navigation, ISR generation and revalidation. Unknown hosts
  and direct internal paths cannot select another site's game.
- Canonicals, hreflang, sitemap, share links and rendered-image links use the
  correct site. Preview deployments remain noindex and auth stays in preview.
- Game switching preserves supported page/locale state, drops incompatible
  identifiers and gives the agreed fallback for unsupported content.
- Authenticated data and hydration do not cross users or games. Unsupported
  capabilities are absent from navigation and rejected server-side.
- In a fresh browser, completing Tomochu login leaves no usable maimai app
  session, including in server-side session state. Transaction cookies expire
  or are removed; no persistent central SSO session remains.
- Existing maimai login survives Tomochu authorization unchanged in identity
  and expiry. Tomochu sign-out revokes only Tomochu; maimai sign-out revokes only
  maimai. Refreshing or refocusing a logged-out site does not sign it back in.
- Auth cancellation, expiry and invalid transaction/callback checks fail safely
  without creating either unintended session. Verify passkeys and social login
  through the intended Tomomai ceremony and account-linking/policy rules.
- Keyboard/mobile navigation, localized labels and empty/error states work for
  each supported game. Real maimai fetch, account settings, profiles and render
  flows retain their existing behavior.

## Open decisions

1. Should shared account/security/application settings appear in both branded
   sites or live centrally? Central settings on Tomomai need an explicit access
   design for a Tomochu-only user; they must not quietly create a maimai session.
2. Confirm catalog fallback for song details and dashboard fallback for
   unsupported features, including unsupported destination regions.
3. Should a Tomochu-only session help explicitly sign in to Tomomai, or should
   Tomomai ask for authentication again? Automatic reverse transfer is not agreed.
4. Confirm global developer/legal/content placement, first-party login consent
   copy and behavior when the destination has a different signed-in account.
5. Choose the supported auth-library approach and session binding after the
   spike, then finalize local/preview host and callback configuration.
6. Finalize Tomochu visual assets and which capabilities constitute a usable
   first release. Keep its public entry hidden until those launch gates pass.
