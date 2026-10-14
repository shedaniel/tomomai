# Multi-domain sites

## Proposal

This document is a proposal, not a description of the current app. Today each deployment serves one game, chosen by `FRONTEND_GAME` ([MULTI_GAME.md](../MULTI_GAME.md)), and nothing links the two sites. The proposal serves maimai DX on `tomomai.lol` and CHUNITHM on `tomochu.app` from one application, with sign-in hosted on `tomomai.lol` and a separate session per site.

### Confirmed decisions

- Each public domain selects exactly one game: `tomomai.lol` is maimai and `tomochu.app` is CHUNITHM. Neither domain exposes a game segment in page URLs.
- Public routes remain locale-first, `/{locale}/...`. Existing maimai URLs remain valid without a migration redirect.
- Region behavior stays unchanged. Do not add region segments to dashboard or catalog URLs. Retain existing profile region routes and selection behavior.
- Switching games switches domains and preserves the equivalent page where possible. Game-specific records do not automatically have an equivalent.
- CHUNITHM remains hidden until usable, including in the public game switcher.
- Both sites use the same accounts and backend. Different sessions do not mean different accounts or separate player identities.
- Login is hosted on `tomomai.lol`, but creates an application session only on the requesting site. A fresh Tomochu login must leave Tomomai logged out.
- Sign out affects the current site's session only. It must not immediately trigger an automatic cross-site sign-in.

The earlier proposal for public `/{locale}/{game}` URLs is superseded. Explicit internal game routing remains an implementation option.

### Public routes

The paths below apply on each game's domain. Availability is subject to that game's capabilities. Preserve current slugs, query parameters and navigation behavior when migrating maimai.

| Surface | Public path | Scope and behavior |
| --- | --- | --- |
| Dashboard | `/{locale}` | Current domain's game. Preserve supported `?tab=...` navigation |
| Database landing | `/{locale}/db` | Current game's available catalog sections |
| Song catalog | `/{locale}/db/songs` | Current game, existing region selection behavior |
| Song detail | `/{locale}/db/songs/{slug}` | Resolve the slug within the current game |
| Public profile | `/{locale}/profile/{username}` | Preserve existing region resolution behavior within the game |
| Regional profile | `/{locale}/profile/{username}/{region}` | Explicit region retained, validated for the game |
| Settings entry | `/{locale}/settings` | Currently redirects to `/settings/account`. Final placement remains open |
| Account settings | `/{locale}/settings/account` | Shared account data. Central versus branded placement remains open |
| Privacy settings | `/{locale}/settings/privacy` | The main region is per game. Publishing and the privacy switches are account-wide |
| Fetch settings | `/{locale}/settings/fetch` | Game-specific controls and supported fetch features |
| Connected applications | `/{locale}/settings/applications` | Account-wide grants. Placement remains open |
| Developer settings | `/{locale}/settings/developer` | Account-wide keys and clients. Placement remains open |

Song detail uses both the normal `[type]/[slug]` route and the parallel `@detail` slot. Preserve list state, direct navigation and browser back behavior.

Truly global surfaces need their own policy, outside the game page rewrite:

- Keep `/api/...`, `/.well-known/...`, static assets and framework assets unlocalized. The existing API keeps `/api/v1/games/{game}/...`. A frontend domain rule does not remove API game identity or change client contracts.
- Authentication callbacks and authorization endpoints are infrastructure, even when a localized login screen surrounds them. Assign each an explicit host and callback registration, and do not run them through generic page rewrites.
- `/tos` and `/privacy` are currently locale-independent. Recommend one canonical policy source covering both brands, with links from both sites. Final hosting and product wording require confirmation.
- Recommend keeping developer documentation at `tomomai.lol/{locale}/developer` because it describes the shared API. Existing userscript and CN proxy routes keep their compatibility behavior on the maimai site until separately designed.
- Maintenance, errors, robots, sitemap and metadata must resolve the correct site even though they are not ordinary game-content pages.

### Domain resolution and internal routing

Recommended architecture: one application, a small explicit site configuration, shared components, and server-resolved game context. Domain mapping belongs in one module together with brand name, canonical origin and configured aliases. Do not derive a game from a string suffix, arbitrary host input or client state.

A candidate internal tree is `app/[locale]/[game]/...`. For example:

| Public request | Internal destination |
| --- | --- |
| `tomomai.lol/ja/db/songs` | `/ja/maimai/db/songs` |
| `tomochu.app/ja/db/songs` | `/ja/chunithm/db/songs` |

This is a rewrite, not a browser redirect. Confirm Next.js parallel routes, RSC requests, prefetches and on-demand ISR work before committing to the tree. Shared account, legal and developer routes need not live under `[game]` just because game pages do. Middleware must preserve current security headers, request IDs, maintenance handling, locale negotiation and API cookie exclusions.

Production host resolution must use an explicit allowlist. Only honor forwarded host and protocol headers from the configured trusted proxy boundary. Reject unknown hosts, and overwrite any externally supplied internal game-context header. Validate that internal game params agree with the resolved site. Requests that manually include an internal game segment must not expose another game on the wrong domain. Recommend returning 404 for these unpublished paths.

Maimai is the default for the existing site, not a fallback for arbitrary production hosts. Configure existing `cn.tomomai.lol` behavior explicitly, including its auth-cookie and proxy relationship, rather than silently breaking it.

For development, keep `localhost:3000` mapped to maimai for compatibility and configure a second explicit local hostname for CHUNITHM. Prefer distinct hosts with local HTTPS for auth verification, because different ports on localhost do not isolate cookies. Preview hosts must map to a chosen game through trusted deployment configuration. They should be noindex and use registered test auth callbacks. Never redirect preview authentication into production by accident.

### Links, game switching and SEO

Introduce a typed public URL builder taking site or game, locale, route and supported parameters. Internal route segments must not appear in generated links. Use this boundary for navigation, redirects, metadata, email links, share links and image URLs. Keep same-site navigation compatible with `next-intl`. Cross-site switching is a full navigation to an allowlisted origin.

Recommended switch behavior, pending confirmation of the fallback choices:

| Source | Destination |
| --- | --- |
| Dashboard or catalog | Equivalent page on the other domain |
| Profile | Same username and region when supported. Show that game's empty profile if no records exist |
| Song detail | Other game's catalog. Never infer song equivalence from a slug or name |
| Unsupported feature | Other game's dashboard with brief explanatory feedback |
| Shared settings | Equivalent settings page if replicated, otherwise its chosen central location |

Carry locale and only allowlisted, meaningful query state. Do not carry snapshot IDs, song IDs, authorization parameters or unrelated filters across games. If the region is unsupported on the destination, use its established region selection flow instead of inventing a new URL segment or silently mixing data.

Use the canonical game domain for page canonicals, Open Graph URLs, structured data and sitemap entries. `hreflang` links connect translations of the same page in the same game, and CHUNITHM is not a translation of maimai. Generate separate site sitemaps and robot policies, preserving legitimate maimai URLs. Shared content should have one chosen canonical rather than competing copies. Audit `resolveBaseUrl`, `resolveBaseUrlFromHeaders`, `seo.ts`, the root layout and the sitemap: a single deployment-level origin is insufficient for two brands on one deployment.

### Game context across domains

Client navigation must not change game identity without a domain change. Pass the game explicitly through page loaders, tRPC calls, query keys, hydration, server caches, static generation and revalidation, and include region, version and user where the existing data contract requires them. Ensure that requesting the same public path on two domains cannot reuse the other game's HTML, RSC payload or cached metadata. CDN origin separation alone does not isolate application caches. Map publication invalidation to internal game-specific pages and data tags.

Keep the compact existing layout and theme system. Exact Tomochu artwork and colors remain a separate design choice. The game switcher should be keyboard accessible, name the destination clearly and distinguish game from language and region controls.

### Authentication and site-local sign out

#### Required behavior

A browser with neither site's session starts sign-in on Tomochu:

1. Tomochu creates a bounded login transaction and redirects to a dedicated authorization flow hosted on Tomomai.
2. The user authenticates there. Temporary transaction cookies are allowed, but no maimai application session or persistent central SSO session is issued.
3. The flow returns a short-lived, single-use authorization code to the exact registered Tomochu callback.
4. Tomochu redeems it server-side and establishes its own application session.
5. Tomochu is signed in, and visiting Tomomai still shows a signed-out account.

When a valid maimai session already exists, authorization may reuse it without creating another session or refreshing its expiry solely because of transfer. The destination keeps its independent session lifetime. Existing sessions must not be overwritten to satisfy another site's login transaction.

Use a maintained, reviewed OAuth or OIDC authorization-code implementation with PKCE, transaction state, exact callback validation and appropriate issuer, audience and nonce checks. Do not put application session tokens in URLs. Callbacks and transaction responses must not be publicly cached, and codes or tokens must not be logged. Completed, cancelled and expired flows must clean up temporary state. First-party account matching must use verified immutable identity, not an unverified email or display name.

Sign out revokes the current site's server session, clears that site's cookie and resets its client-side authenticated caches. It leaves the other site's session intact. Public browsing after logout does not trigger authorization, and returning to Tomomai after a Tomochu-only login does not silently sign in. A fresh explicit sign-in or game-switch action may initiate authorization.

#### Feasibility gate before implementation

The app uses Better Auth and `@better-auth/oauth-provider`, backed by the shared Drizzle adapter. `apps/main/src/lib/auth.ts` configures the provider with `loginPage: "/"`, Discord and X sign-in, passkeys, trusted origins and optional cross-subdomain cookies. `auth-client.ts` exposes the ordinary Better Auth sign-in and sign-out client. The session table has no explicit site binding.

This is useful existing infrastructure, but it does not establish that the required authentication-without-maimai-session flow is supported. An initial library spike must establish:

- A supported way to authenticate a login transaction and issue a destination authorization result without issuing a maimai app session. Ordinary login followed by deleting its cookie or session is not an acceptable shortcut.
- How to distinguish transaction credentials from app credentials and enforce site ownership during session creation, validation, refresh and revocation. Separate cookie domains alone do not establish server-side session audience. Choose a supported site-binding mechanism after the spike. Do not assume a new database column is mandatory or that current tokens already enforce it.
- Whether reading an existing session during authorization triggers automatic refresh, and how to prevent transfer-only extension of its lifetime.
- How first-party authorization fits the existing provider scopes, consent, audience configuration and disabled endpoints without widening third-party client privileges or weakening existing security, policy or freshness checks.
- How cancellation, concurrent tabs, returning users and a destination already signed in as another account behave. Recommend explicit account-switch confirmation rather than silently replacing a different account's session.

Passkeys are bound to the maimai registrable domain. Keeping the login ceremony on Tomomai can preserve those credentials, but they cannot simply be used at Tomochu's origin. Validate the existing RP ID and origin setup and the social callback registrations for every supported deployment, including the CN proxy.

The goal is a standard, maintained auth flow, not a bespoke protocol. If the installed library cannot separate authentication and session issuance, report the limitation and choose a supported integration or library change before implementing the cross-site feature. Do not silently relax the session requirements. Seamless reverse transfer from a Tomochu-only session back into Tomomai remains an open product and architecture question, not a requirement.

### Implementation sequence

1. **Resolve the remaining product choices and run the auth spike.** Record the supported library approach and session behavior before coupling it to UI. Route and context work can proceed in parallel with this bounded investigation.
2. **Introduce site context and URL builders.** Configure hosts, isolate caches, prototype internal rewrites, update locale and SEO plumbing and preserve existing maimai URLs. Keep CHUNITHM publicly unavailable.
3. **Implement destination-only login and local logout.** Integrate the selected maintained flow, and verify two real browser origins before enabling Tomochu.
4. **Complete Tomochu launch gates.** Finalize branding, register production hosts and callbacks and expose the cross-domain switcher together.

Frontend domain routing alone should not require a schema migration. If the auth spike identifies one, follow the repository's migration notification, reset and generation rules in that task, and never apply migrations from the workflow. Roll out routing changes with maimai regression verification first. Keep a feature switch for cross-domain login and navigation so it can be disabled without undoing the working maimai pages, and do not remove active session infrastructure until its sessions have been safely retired.

### Acceptance checks

- Existing maimai deep links, query tabs, locale redirects, profile region behavior and song detail and back navigation work unchanged.
- The same public path on each domain resolves its own game under cold and warm cache, prefetch, RSC navigation, ISR generation and revalidation. Unknown hosts and direct internal paths cannot select another site's game.
- Canonicals, hreflang, sitemap, share links and rendered-image links use the correct site. Preview deployments remain noindex and auth stays in preview.
- Game switching preserves supported page and locale state, drops incompatible identifiers and gives the agreed fallback for unsupported content.
- Authenticated data and hydration do not cross users or games. Unsupported capabilities are absent from navigation and rejected server-side.
- In a fresh browser, completing Tomochu login leaves no usable maimai app session, including in server-side session state. Transaction cookies expire or are removed, and no persistent central SSO session remains.
- Existing maimai login survives Tomochu authorization unchanged in identity and expiry. Tomochu sign-out revokes only Tomochu, and maimai sign-out revokes only maimai. Refreshing or refocusing a logged-out site does not sign it back in.
- Auth cancellation, expiry and invalid transaction or callback checks fail safely without creating either unintended session. Verify passkeys and social login through the intended Tomomai ceremony and account-linking and policy rules.
- Keyboard and mobile navigation, localized labels and empty and error states work for each supported game. Real maimai fetch, account settings, profiles and render flows retain their existing behavior.

### Open decisions

1. Should shared account, security and application settings appear in both branded sites or live centrally? Central settings on Tomomai need an explicit access design for a Tomochu-only user, and must not quietly create a maimai session.
2. Confirm the catalog fallback for song details and the dashboard fallback for unsupported features, including unsupported destination regions.
3. Should a Tomochu-only session help explicitly sign in to Tomomai, or should Tomomai ask for authentication again? Automatic reverse transfer is not agreed.
4. Confirm global developer, legal and content placement, first-party login consent copy and behavior when the destination has a different signed-in account.
5. Choose the supported auth-library approach and session binding after the spike, then finalize local and preview host and callback configuration.
6. Finalize Tomochu visual assets and which capabilities constitute a usable first release. Keep its public entry hidden until those launch gates pass.
