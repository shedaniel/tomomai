# Setup

- [Local Development](#local-development): running the apps on your machine against the Docker stack
- [Deployment](#deployment): hosting each app, migrations, environment variables and populating data

## Local Development

The [README](README.md#local-development) has the quick start. In short, `pnpm install && make setup && pnpm dev:mai`.

### Running Locally

Use Node.js 22.18 or later. `apps/main/eslint.config.mjs`, `apps/main/scripts/register-discord-commands.js` and the `@tomomai/games` tests load TypeScript files through Node's built-in type stripping, which older versions do not have.

Each process serves one game, chosen by `FRONTEND_GAME` (see [App Configuration](#app-configuration)). Run these from the repository root, in separate terminals to run them together:

| Command | Serves | Port |
|---|---|---|
| `pnpm dev:mai` | maimai DX | 3000 |
| `pnpm dev:chu` | CHUNITHM | 3001 |
| `pnpm guess:dev` | The guess app | 3002 |

`pnpm dev:mai` and `pnpm dev:chu` set `FRONTEND_GAME` and `PORT`. For another port, set `PORT` rather than appending `--port` to the dev script. In development CHUNITHM builds into `.next-chunithm` instead of `.next`, so the two servers share no locks, output or caches. Browser cookies are shared across localhost ports, so both local sites see the same session.

The game is fixed per build. Set `FRONTEND_GAME` when building, start the build with the same value, and build each game's production output separately rather than concurrently in one checkout. [docs/MULTI_GAME.md](docs/MULTI_GAME.md) explains how the app keeps the games apart.

### Generated Env Files

`make setup` (or `make env` on its own) runs `scripts/dev-env.sh`, which creates these files only if they don't exist:

| File | Used by | Contents |
|---|---|---|
| `.env.local` | `apps/main` (via the `apps/main/.env.local` symlink) | Local Postgres, Redis and RustFS URLs, generated secrets, `NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE=enabled`, blank OAuth credentials |
| `apps/render/.env.local` | `apps/render` | Copied from `apps/render/.env.example`, with `RENDER_TOKEN_SECRET` matching `.env.local` and `CATALOG_URL=http://localhost:3000` |
| `apps/guess/.env.local` | `apps/guess` | Generated `GUESS_DAILY_SECRET`, the local `guess` database, Redis, `TOMOMAI_API_URL=http://localhost:3000` |

To regenerate a file, delete it and run `make env`. If you regenerate only one of `.env.local` and `apps/render/.env.local`, the script warns you to copy `RENDER_TOKEN_SECRET` across by hand so the two still match.

### How Local Differs From Production

- **Storage**: RustFS replaces Cloudflare R2. `R2_FORCE_PATH_STYLE=true` switches the S3 client to path-style URLs, and `NEXT_PUBLIC_R2_URL` points at the public-read bucket.
- **Sign-in**: in `NODE_ENV=development`, the sign-in dialog shows **Continue as anonymous user**, which creates a throwaway `anon-<id>@dev.local` account. Fill in `DISCORD_*` or `TWITTER_*` to test real OAuth, using `http://localhost:3000/api/auth/callback/<provider>` as the redirect URI.
- **Song data**: `make seed` copies each game's public catalogue from its live site (override with `SEED_MAIMAI_URL` and `SEED_CHUNITHM_URL`) instead of scraping SEGA with the [admin update routes](#populating-songs-data).
- **Optional services**: Edge Config, Turnstile, log shipping, OpenRouter and the CN fetchers are disabled while their variables are unset. `CRON_SECRET` is not required in development.
- **Discord interactions**: Discord can only deliver slash commands to a public URL. `pnpm tunnel` runs a Cloudflare tunnel to `localhost:3000` (it needs your own `cloudflared` tunnel named `tomomai`). Set the bot's Interactions Endpoint URL to `<tunnel-url>/api/interactions`.

### Resetting

`make down` stops the containers and keeps their data. `make reset` deletes the Docker volumes, then re-runs `up`, `migrate` and `seed`. It does not touch your env files.

## Deployment

| Component | Host | Notes |
|---|---|---|
| `apps/main` | Vercel, one project per game | Build settings are in `vercel.json` and `apps/main/vercel.json`, including the daily `/api/cron/percentile-bands` cron, which answers 404 outside the maimai deployment |
| `apps/guess` | Vercel | One project per variant (`guesser.` and `heardle.`), configured by `apps/guess/vercel.json` |
| `apps/render` | Docker on any long-lived host | See [Render Service Deployment](#render-service-deployment) |

### Main Site (Vercel)

1. Provision Postgres, Redis and a Cloudflare R2 bucket with a public URL.
2. Import the GitHub repository into Vercel and connect an Edge Config store to the project.
3. Set the [environment variables](#environment-variables) in the Vercel dashboard, including `FRONTEND_GAME` for the game the project serves.
4. Apply the [database migrations](#database-migrations).
5. Set up the [Discord application](#discord) and register the bot commands.
6. Deploy the [render service](#render-service-deployment) and set `RENDER_PUBLIC_URL` to its origin.
7. [Populate songs](#populating-songs-data) and [events](#populating-events-data).

### Database Migrations

The main site and the guesser use separate Postgres databases, each with its own migration directory:

| App | Schema | Migrations |
|---|---|---|
| main | `apps/main/src/lib/db/schema-pg.ts` | `apps/main/drizzle-pg` |
| guess | `apps/guess/src/lib/db/schema.ts` | `apps/guess/drizzle` |

Apply them with the production `POSTGRES_URL` of each database:

```bash
POSTGRES_URL=<main-database-url> pnpm db:migrate
```

```bash
cd apps/guess && POSTGRES_URL=<guess-database-url> pnpm exec drizzle-kit migrate
```

Run migrations before deploying code that depends on them.

### Guesser (Vercel)

1. Create a Vercel project from the same repository with **Root Directory** set to `apps/guess`.
2. Set `GUESS_DAILY_SECRET` (`openssl rand -hex 32`) and `NEXT_PUBLIC_SITE_URL`. For the heardle variant, also set `NEXT_PUBLIC_GUESSER_MODE=heardle` and `GUESS_HINT_COUNT=7`.
3. Optional: set `POSTGRES_URL` to a dedicated database, apply its [migrations](#database-migrations), then run `pnpm backfill:daily --from <first puzzle date>` once so past puzzles stay frozen.
4. Optional: for "Sign in with tomomai", register an OAuth app on the main site (Settings → Developer → OAuth Applications) with the `user:metadata:read` scope and `<NEXT_PUBLIC_SITE_URL>/api/auth/callback` as its redirect URI, then set `TOMOMAI_OAUTH_CLIENT_ID` and `TOMOMAI_OAUTH_CLIENT_SECRET`.

`apps/guess/.env.example` documents every variable, including Turnstile and Redis rate limiting.

### Render Service Deployment

Build the image from the repository root:

```bash
docker build -f apps/render/Dockerfile -t tomomai-render .
```

Run it on a host with cheap egress. It is a long-lived process, so its image cache stays warm between requests. It listens on `PORT` (default `8080`) and exposes `GET /health` for liveness checks. Set these variables on the container:

| Variable | Required | Description |
|---|---|---|
| `RENDER_TOKEN_SECRET` | Yes | Must match `RENDER_TOKEN_SECRET` on `apps/main` |
| `CATALOG_URL` | No | Main site origin used to fetch `/api/v1/games/{game}/songs` (defaults to `https://tomomai.lol`) |
| `NEXT_PUBLIC_R2_URL` | Yes | Same R2 public URL as `apps/main` |
| `NEXT_PUBLIC_R2_URL_CN` | No | Same CN R2 mirror URL as `apps/main` |
| `CORS_ORIGIN` | No | Allowed origin for `/img` (defaults to `*`) |
| `LOG_LEVEL` | No | Log level (defaults to `info`) |

See `apps/render/README.md` for how the service works.

### Discord

#### Discord OAuth (for user authentication)

1. **Create Discord Application**
   - Visit [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and name it
   - Navigate to "OAuth2" section

2. **Configure OAuth2**
   - Add redirect URI: `https://yourdomain.com/api/auth/callback/discord`
   - For local development: `http://localhost:3000/api/auth/callback/discord`
   - Copy Client ID and Client Secret to `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`

#### Discord Bot (for bot functionality)

1. **Enable Bot**
   - In your Discord Application, navigate to "Bot" section
   - Click "Add Bot" to create a bot user
   - Copy the Bot Token to `DISCORD_BOT_TOKEN`

2. **Get Application Credentials**
   - Go to "General Information" section
   - Copy "Application ID" to `NEXT_PUBLIC_DISCORD_APPLICATION_ID`
   - Copy "Public Key" to `DISCORD_PUBLIC_KEY`

3. **Set Interactions Endpoint URL**
   - In "General Information", scroll to "Interactions Endpoint URL"
   - Set it to: `https://yourdomain.com/api/interactions`
   - This tells Discord where to send slash command interactions

4. **Register Bot Commands**
   ```bash
   pnpm --filter @tomomai/site discord:register
   ```
   Re-run this whenever a command definition changes.

5. **Invite Bot to Server**
   - Use `/invite` slash command to get an invite link
   - Or manually create: `https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=applications.commands`

### Environment Variables

These are the variables for `apps/main`. The guesser and render service have their own, listed above.

#### Database

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |

#### Auth

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Secret key for Better Auth. Generate with `openssl rand -base64 32` |
| `DISCORD_CLIENT_ID` | Yes | Discord OAuth application client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth application client secret |
| `TWITTER_CLIENT_ID` | No | X (Twitter) OAuth 2.0 client ID. Required to enable X login |
| `TWITTER_CLIENT_SECRET` | No | X (Twitter) OAuth 2.0 client secret. Required to enable X login |
| `BETTER_AUTH_URL` | Recommended | Public base URL used by Better Auth for callbacks, passkey relying-party ID and OAuth token audience. Falls back to `NEXT_PUBLIC_SITE_URL`, then the Vercel URL |
| `ALTCHA_HMAC_KEY` | Recommended | HMAC secret for ALTCHA captcha challenges used during passkey registration. Generate with `openssl rand -hex 32`. Required in non-development environments |

##### Setting up X (Twitter) OAuth

1. Go to the [X Developer Portal](https://developer.twitter.com/en/portal/dashboard) and create an app.
2. Under **User authentication settings**, enable OAuth 2.0 with **Type of App** set to **Web App**.
3. Add your callback URL: `https://yourdomain.com/api/auth/callback/twitter`
4. Copy the **Client ID** and **Client Secret** into `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`.

##### Setting up Passkeys (WebAuthn)

Passkeys work out of the box — no extra provider credentials needed. Set `ALTCHA_HMAC_KEY` to prevent passkey registration without a valid captcha solution. Users can register passkeys from Account Settings → Passkeys after signing in with Discord or X.

#### Cloudflare Turnstile

Both `apps/main` and `apps/guess` support a site-wide Turnstile pre-clearance gate. Set both credentials separately on each deployment to enable it; if either credential is absent, Turnstile is disabled.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Public Turnstile widget site key. This is bundled at build time and only takes effect when `TURNSTILE_SECRET_KEY` is also set. Enable pre-clearance on the widget and allow every hostname served by the deployment. |
| `TURNSTILE_SECRET_KEY` | No | Server-only widget secret used by `/api/turnstile/verify`. Turnstile remains disabled unless this and the public site key are both set. Never expose this value to the client. |
| `TURNSTILE_EXPECTED_HOSTNAME` | Recommended | Exact hostname expected in the Siteverify response, such as `www.tomomai.lol`, `guesser.tomomai.lol`, or `heardle.tomomai.lol`. |

When enabled, the widget must have [pre-clearance enabled](https://developers.cloudflare.com/turnstile/concepts/pre-clearance-support/) at the clearance level used by the zone's WAF challenge rule. The application validates every token with Siteverify; Cloudflare's `cf_clearance` cookie and WAF configuration enforce clearance for subsequent site traffic.

#### Discord Bot

| Variable | Required | Description |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | Yes | Discord application public key for interaction verification |
| `NEXT_PUBLIC_DISCORD_APPLICATION_ID` | Yes | Discord application ID (public, used client-side) |
| `DISCORD_BOT_TOKEN` | Scripts | Bot token for registering slash commands |
| `DISCORD_UPDATE_WEBHOOK_<GAME>_<REGION>` | No | Public catalog update channel for one game and region, such as `DISCORD_UPDATE_WEBHOOK_CHUNITHM_JP`. It takes precedence over every other update variable |
| `DISCORD_UPDATE_WEBHOOK_<GAME>` | No | Public catalog update channel for every region of one game (`MAIMAI` or `CHUNITHM`) |
| `DISCORD_UPDATE_WEBHOOK_<REGION>` | No | Legacy maimai update channel for one region (`JP`, `INTL` or `CN`). maimai reads it only when neither maimai variable is set, and CHUNITHM never reads it |
| `DISCORD_UPDATE_WEBHOOK` | No | Legacy maimai update channel for every region, read last. CHUNITHM never reads it |
| `DISCORD_UPDATE_WEBHOOK_NOTICE` | No | Webhook URL for posting update notices. The channel should never be publicly accessible as it contains admin confirmation buttons |

#### Cloudflare R2

| Variable | Required | Description |
|---|---|---|
| `R2_ENDPOINT` | Yes | R2 S3-compatible endpoint URL |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret access key |
| `R2_BUCKET` | Yes | R2 bucket name |
| `NEXT_PUBLIC_R2_URL` | Yes | Public base URL for R2 assets |
| `NEXT_PUBLIC_R2_URL_CN` | No | Alternate public base URL served to visitors from mainland China |
| `R2_FORCE_PATH_STYLE` | No | Set to `true` to use path-style S3 URLs. Needed for RustFS in local development, not for R2 |

#### Admin

| Variable | Required | Description |
|---|---|---|
| `ADMIN_UPDATE_TOKEN` | Yes | Bearer token for admin API routes. Generate with `openssl rand -base64 32`. Every game's deployment needs the same value when `CATALOG_PEER_ORIGINS` is set |
| `CATALOG_PEER_ORIGINS` | No | Comma-separated origins of the other games' deployments, such as `https://chunithm.example.com`. After a catalog write, this site asks each peer to drop its cached copy of that game's public API data. Leave it unset for a single deployment |
| `CRON_SECRET` | Yes | Vercel sends it as a bearer token on cron requests. Without it, `/api/cron/percentile-bands` rejects every request outside development. Generate with `openssl rand -hex 16` |

#### Crypto / Tokens

| Variable | Required | Description |
|---|---|---|
| `TOKEN_SECRET` | Yes | Secret for encrypting/decrypting user tokens. Generate with `openssl rand -base64 32` |
| `LOGIN_TOKEN_SECRET` | Yes | Secret for the gateway login OTP codes and the signed login authorization. The former name `MAIMAI_TOTP_SECRET` is still read when this is unset. Generate with `openssl rand -hex 32` |
| `FLAGS_SECRET` | Yes | Secret for feature flags. Generate with `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` |

#### Render Service

Image rendering (profile/export, last-credit, daily-plays) runs in a separate
service (`apps/render`). `apps/main` is the auth boundary. It mints a signed
token and either 302s browser image requests to the render service or asks it to
upload the Discord followup. These are the variables `apps/main` needs to talk to
that service.

| Variable | Required | Description |
|---|---|---|
| `RENDER_TOKEN_SECRET` | Yes | Shared HMAC secret. `apps/main` signs render tokens with it and the render service verifies them, so it must match the render service's `RENDER_TOKEN_SECRET`. Generate with `openssl rand -base64 32` |
| `RENDER_PUBLIC_URL` | Yes | Public origin of the render service (e.g. `https://render.yourdomain.com`). The image routes 302 here, and it is added to the Content-Security-Policy `img-src`/`connect-src` so browsers can load and download the images |
| `RENDER_INTERNAL_URL` | No | Server-to-server origin used for the Discord followup upload call. Falls back to `RENDER_PUBLIC_URL`. Set this when the render service is reachable on a private or internal URL from `apps/main` |

#### AI

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_KEY` | For events | OpenRouter API key for AI-powered event fetching |
| `AI_MODEL` | No | AI model to use (recommended: `google/gemini-3.1-flash-lite-preview`) |

#### Logging

| Variable | Required | Description |
|---|---|---|
| `LOG_LEVEL` | No | Log level (defaults to `trace` in dev, `info` in prod) |
| `DEV_LOGTAIL_SOURCE_TOKEN` | No | Logtail source token for dev log shipping |
| `INGESTING_HOST` | No | Custom Logtail ingestion endpoint host |
| `AXIOM_TOKEN` | No | Axiom API token for log shipping (requires `AXIOM_DATASET`) |
| `AXIOM_DATASET` | No | Axiom dataset name to ingest logs into (requires `AXIOM_TOKEN`) |
| `AXIOM_URL` | No | Custom Axiom ingest host (defaults to `api.axiom.co`; use `api.eu.axiom.co` for EU) |

#### App Configuration

| Variable | Required | Description |
|---|---|---|
| `FRONTEND_GAME` | No | The game this process serves: `maimai` (the default) or `chunithm`. Any other value fails startup. Set it when building and use the same value when starting that build |
| `PORT` | No | Port of the local server (defaults to `3000`). Without a deployment URL, local canonical links and the development auth origins use `http://localhost:<PORT>` |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL. Without it, invite links and the API reference use the site's base URL, and the CORS allowlist uses `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_URL` | No | Overrides the server-side base URL. Set it when a deployment lives behind a custom domain alias that Vercel's env vars don't expose |
| `NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE` | No | Signup mode: `disabled`, `invite-only`, or `enabled` (defaults to `disabled`). Set to `enabled` to allow account registration |
| `NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS` | No | Comma-separated maimai regions (`intl,jp` by default). An empty value disables maimai player features, and its catalog stays readable. A value that names no maimai region is logged as an error and disables them too |
| `NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS` | No | Comma-separated CHUNITHM regions (`intl,jp` by default). An empty value disables CHUNITHM player features, and its catalog stays readable. A value that names no CHUNITHM region is logged as an error and disables them too |
| `NEXT_PUBLIC_ENABLED_REGIONS` | No | Legacy maimai fallback when `NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS` is unset. An empty value counts as unset |
| `DEMO_FETCH` | No | Set to `true` to use demo data for fetching |
| `TRUSTED_ORIGINS` | No | Comma-separated list of additional origins (e.g. `https://tomomai.lol,https://cn.tomomai.lol`). Read by Better Auth (`trustedOrigins`) and the CORS allowlist. Required when fronting the app with the [`cn/` reverse proxy](#cn-reverse-proxy-hk-cn2) so the proxy hostname is accepted for OAuth callbacks and CORS. |
| `AUTH_COOKIE_DOMAIN` | No | Cookie domain for cross-subdomain Better Auth sessions (e.g. `.tomomai.lol`). Set this when serving the same app under multiple hostnames (apex + `cn.` proxy) so a session set on one is valid on the other. Omit for single-hostname deployments. |

#### Game Site Request Budget

Every instance shares a few egress IPs, and SEGA's NETs lock a client out (ERROR CODE 200001) after too many requests in a short time. So every request to maimai DX NET or CHUNITHM-NET takes a slot from one Redis-backed budget per host, waiting up to 30 seconds before the fetch fails as busy. When a site locks us out, every instance stops sending to it for a while. Without Redis, or when Redis does not answer within 500 ms, requests go out unthrottled.

| Variable | Required | Description |
|---|---|---|
| `<GAME>_<REGION>_REQUESTS_PER_SECOND` | No | Requests per second to one game site, such as `MAIMAI_INTL_REQUESTS_PER_SECOND` or `CHUNITHM_JP_REQUESTS_PER_SECOND` (defaults to `5`) |
| `<GAME>_LOCK_SECONDS` | No | How long every instance stops sending to the game's sites after one locks us out, such as `MAIMAI_LOCK_SECONDS` (defaults to `300`) |

#### China Fetcher Providers

These power the four options in the CN token dialog. All variables are optional — if a provider's variables are unset, that option is shown as "尚未配置" in the dialog and the rest of the providers continue to work.

##### Diving-Fish (水鱼查分器)

| Variable | Required | Description |
|---|---|---|
| `DIVINGFISH_DEV_TOKEN` | For diving-fish | Developer token issued by diving-fish, used to verify account ownership via the nickname challenge or import-token flows |

##### Lxns (落雪咖啡屋查分器)

| Variable | Required | Description |
|---|---|---|
| `LXNS_CLIENT_ID` | For lxns | OAuth client ID issued by lxns |
| `LXNS_CLIENT_SECRET` | For lxns | OAuth client secret issued by lxns |

##### HTTP Proxy (CN OAuth interception)

Used by the WeChat OAuth → HTTP-proxy flow.

| Variable | Required | Description |
|---|---|---|
| `CN_PROXY_HOST` (or `NEXT_PUBLIC_CN_PROXY_HOST`) | For HTTP proxy | Hostname/IP the user's phone should set as its HTTP proxy (displayed in the dialog) |
| `CN_PROXY_PORT` (or `NEXT_PUBLIC_CN_PROXY_PORT`) | No | Proxy port displayed in the dialog (defaults to `2560`) |
| `CN_PROXY_TOKEN_SECRET` | For HTTP proxy | HMAC secret for signing the expiring token embedded in the WeChat OAuth link. The proxy forwards it back so the webhook can identify the user. Generate with `openssl rand -base64 32` |
| `DEBUG_CN_FETCH` | No | When set (any truthy value), the `/api/cn-proxy/callback` webhook skips the server-side cookie capture and just logs the `maimai-mobile/?t=…` link so you can open it manually in a browser to inspect CSS/HTML. No fetch session is started while this is on. |

##### Android App

Not yet implemented; no env vars.

#### Vercel (auto-set by platform)

| Variable | Description |
|---|---|
| `EDGE_CONFIG` | Vercel Edge Config connection string (implicitly required by the `@vercel/edge-config` package). Set up via the Vercel dashboard at vercel.com |
| `VERCEL` | Set to `1` when running on Vercel |
| `VERCEL_URL` | Auto-assigned deployment URL |
| `VERCEL_PROJECT_PRODUCTION_URL` | Auto-assigned production URL |
| `NEXTAUTH_URL` | Base URL override for auth callbacks |

### CN Reverse Proxy (HK CN2)

For deployments serving mainland China users, a Caddy reverse proxy lives in `cn/`. It runs on a CN-routed server (typically an HK box on a CN2 line) and gives users a stable ~40ms RTT path that bypasses Cloudflare's anycast routing. TLS is terminated locally; `_next/static/*` and `/_next/image` are edge-cached on the proxy box to save CN2 bandwidth. HTTP/3 is enabled.

To deploy:

1. Add a gray-cloud (DNS-only) A record pointing your chosen hostname (e.g. `cn.tomomai.lol`) at the CN-routed server's public IP.
2. Add the same hostname as a domain alias on your Vercel project so Vercel routes traffic for it (you don't need to verify Vercel's own cert — Caddy terminates TLS — but the alias is required for the project to accept the Host header).
3. Set `TRUSTED_ORIGINS` and `AUTH_COOKIE_DOMAIN` (see [App Configuration](#app-configuration)) on Vercel so OAuth, CORS, and cross-subdomain sessions accept the new hostname.
4. From your laptop, run `cn/deploy.sh install user@host` and answer the prompts (proxy domain, upstream domain, ACME email, cache TTLs). The script installs Caddy from the official apt repo, rebuilds it once with the [Souin cache module](https://github.com/caddyserver/cache-handler) via `xcaddy`, renders `cn/Caddyfile.tmpl` with your values, validates the rendered config remotely, and only swaps it in if validation passes.
5. Verify with `cn/deploy.sh check cn.tomomai.lol` — five probes (TLS reachability, misdirected-host rejection, HTTP/3, edge-cache HIT on a real `_next/static/*` asset, cert CN match).

The proxy is generalisable to any deployment — none of `Caddyfile.tmpl` or `deploy.sh` is hardcoded to `tomomai.lol`. See `cn/README.md` for the full reference and a "Generalising to your own domain" walkthrough.

### Populating Songs Data

After setting up the database and environment variables, populate each game's song catalog. Catalog writes must run on the game's own deployment, the one whose `FRONTEND_GAME` is that game. Any other deployment answers `409`.

maimai DX reads its International and JP catalogs from maimai DX NET, so those regions need a SEGA account token. On the maimai deployment, update each region:

```bash
# Update JP songs
curl "https://yourdomain.com/api/admin/update_all?game=maimai&region=jp&token=account://<sega-username>:://<sega-password>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"

# Update INTL songs
curl "https://yourdomain.com/api/admin/update_all?game=maimai&region=intl&token=account://<sega-username>:://<sega-password>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

Replace `<sega-username>` and `<sega-password>` with your SEGA account credentials for the respective region.

For INTL, you can also use a cookie token instead of account credentials:

```bash
curl "https://yourdomain.com/api/admin/update_all?game=maimai&region=intl&token=cookie://<cookie-value>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

CHUNITHM reads its catalog from otoge-db and needs no token. Without `region`, `update_all` updates every enabled region. On the CHUNITHM deployment:

```bash
curl "https://your-chunithm-domain.com/api/admin/update_all?game=chunithm" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

When both games are deployed, list each deployment's origin in the other's `CATALOG_PEER_ORIGINS` and give both the same `ADMIN_UPDATE_TOKEN`, so a catalog write on one also refreshes the other's cached API data. [docs/CHUNITHM_CATALOG.md](docs/CHUNITHM_CATALOG.md) describes the CHUNITHM source and its admin requests.

### Preparing a New Game Version

When a new maimai DX version is released, copy the existing songs data to the new version. For example, to prepare version 13 (CiRCLE PLUS) for JP by copying all songs from version 12 (CiRCLE), run this on the maimai deployment:

```bash
curl "https://yourdomain.com/api/admin/import?game=maimai&from=version<=12@jp-12&to=jp-13" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

This copies all songs where `addedVersion <= 12` from `jp-12` to `jp-13`. The `from` parameter format is `version[<=|>=|=]NUMBER@REGION-VERSION_ID` and the `to` parameter format is `REGION-VERSION_ID`, where `REGION` is one of the game's regions (`intl`, `jp` or `cn` for maimai DX).

After importing, run the [songs update](#populating-songs-data) for that region to pull in any new songs added in the new version.

### Populating Events Data

After populating songs, fetch event data (requires `OPENROUTER_KEY` to be set):

```bash
curl -X POST "https://yourdomain.com/api/admin/events/fetch" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

After running this, check the Discord channel configured for `DISCORD_UPDATE_WEBHOOK_NOTICE` and click **Confirm** to approve the fetched events.
