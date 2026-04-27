# Setup

## Environment Variables

### Database

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |

### Auth

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Secret key for Better Auth. Generate with `openssl rand -base64 32` |
| `DISCORD_CLIENT_ID` | Yes | Discord OAuth application client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth application client secret |

### Discord Bot

| Variable | Required | Description |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | Yes | Discord application public key for interaction verification |
| `NEXT_PUBLIC_DISCORD_APPLICATION_ID` | Yes | Discord application ID (public, used client-side) |
| `DISCORD_BOT_TOKEN` | Scripts | Bot token for registering slash commands |
| `DISCORD_UPDATE_WEBHOOK` | No | Webhook URL for posting update notifications |
| `DISCORD_UPDATE_WEBHOOK_NOTICE` | No | Webhook URL for posting update notices. The channel should never be publicly accessible as it contains admin confirmation buttons |

### Cloudflare R2

| Variable | Required | Description |
|---|---|---|
| `R2_ENDPOINT` | Yes | R2 S3-compatible endpoint URL |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret access key |
| `R2_BUCKET` | Yes | R2 bucket name |
| `NEXT_PUBLIC_R2_URL` | Yes | Public base URL for R2 assets |

### Admin

| Variable | Required | Description |
|---|---|---|
| `ADMIN_UPDATE_TOKEN` | Yes | Bearer token for admin API routes. Generate with `openssl rand -base64 32` |

### Crypto / Tokens

| Variable | Required | Description |
|---|---|---|
| `TOKEN_SECRET` | Yes | Secret for encrypting/decrypting user tokens. Generate with `openssl rand -base64 32` |
| `MAIMAI_TOTP_SECRET` | Yes | Secret for TOTP code generation. Generate with `openssl rand -hex 32` |
| `FLAGS_SECRET` | Yes | Secret for feature flags. Generate with `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` |

### AI

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_KEY` | For events | OpenRouter API key for AI-powered event fetching |
| `AI_MODEL` | No | AI model to use (recommended: `google/gemini-3.1-flash-lite-preview`) |

### Logging

| Variable | Required | Description |
|---|---|---|
| `LOG_LEVEL` | No | Log level (defaults to `trace` in dev, `info` in prod) |
| `DEV_LOGTAIL_SOURCE_TOKEN` | No | Logtail source token for dev log shipping |
| `INGESTING_HOST` | No | Custom log ingestion endpoint host |

### App Configuration

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | No | Public app URL (defaults to `http://localhost:3000`) |
| `NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE` | No | Signup mode: `disabled`, `invite-only`, or `enabled` (defaults to `disabled`). Set to `enabled` to allow account registration |
| `NEXT_PUBLIC_ENABLED_REGIONS` | No | Comma-separated list of enabled regions |
| `DEMO_FETCH` | No | Set to `true` to use demo data for fetching |

### China Fetcher Providers

These power the four options in the CN token dialog. All variables are optional — if a provider's variables are unset, that option is shown as "尚未配置" in the dialog and the rest of the providers continue to work.

#### Diving-Fish (水鱼查分器)

| Variable | Required | Description |
|---|---|---|
| `DIVINGFISH_DEV_TOKEN` | For diving-fish | Developer token issued by diving-fish, used to verify account ownership via the nickname challenge or import-token flows |

#### Lxns (落雪咖啡屋查分器)

| Variable | Required | Description |
|---|---|---|
| `LXNS_CLIENT_ID` | For lxns | OAuth client ID issued by lxns |
| `LXNS_CLIENT_SECRET` | For lxns | OAuth client secret issued by lxns |

#### HTTP Proxy (CN OAuth interception)

Used by the WeChat OAuth → HTTP-proxy flow. The proxy itself lives in `proxy/` and must be deployed to a host reachable from the user's phone (typically Aliyun HK / mainland CN).

| Variable | Required | Description |
|---|---|---|
| `CN_PROXY_HOST` (or `NEXT_PUBLIC_CN_PROXY_HOST`) | For HTTP proxy | Hostname/IP the user's phone should set as its HTTP proxy (displayed in the dialog) |
| `CN_PROXY_PORT` (or `NEXT_PUBLIC_CN_PROXY_PORT`) | No | Proxy port displayed in the dialog (defaults to `2560`) |
| `CN_PROXY_TOKEN_SECRET` | For HTTP proxy | HMAC secret for signing the JWT embedded in the WeChat OAuth link; the proxy forwards it back so the webhook can identify the user. Generate with `openssl rand -base64 32` |
| `DEBUG_CN_FETCH` | No | When set (any truthy value), the `/api/cn-proxy/callback` webhook skips the server-side cookie capture and just logs the `maimai-mobile/?t=…` link so you can open it manually in a browser to inspect CSS/HTML. No fetch session is started while this is on. |

The proxy process itself reads its own env vars (`PROXY_PORT`, `WEBHOOK_URL`, `RESULT_URL`) — see `proxy/README.md`.

#### Android App

Not yet implemented; no env vars.

### Vercel (auto-set by platform)

| Variable | Description |
|---|---|
| `EDGE_CONFIG` | Vercel Edge Config connection string (implicitly required by the `@vercel/edge-config` package). Set up via the Vercel dashboard at vercel.com |
| `VERCEL` | Set to `1` when running on Vercel |
| `VERCEL_URL` | Auto-assigned deployment URL |
| `VERCEL_PROJECT_PRODUCTION_URL` | Auto-assigned production URL |
| `NEXTAUTH_URL` | Base URL override for auth callbacks |

## Populating Songs Data

After setting up the database and environment variables, you need to populate the songs database. Run the following curl commands for each region individually:

```bash
# Update JP songs
curl -X POST "https://yourdomain.com/api/admin/update_all?region=jp&token=account://<sega-username>:://<sega-password>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"

# Update INTL songs
curl -X POST "https://yourdomain.com/api/admin/update_all?region=intl&token=account://<sega-username>:://<sega-password>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

Replace `<sega-username>` and `<sega-password>` with your SEGA account credentials for the respective region. Each region must be updated separately.

For INTL, you can also use a cookie token instead of account credentials:

```bash
curl -X POST "https://yourdomain.com/api/admin/update_all?region=intl&token=cookie://<cookie-value>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

## Preparing a New Game Version

When a new maimai DX version is released, you need to copy the existing songs data to the new version. For example, to prepare version 13 (CiRCLE PLUS) for JP by copying all songs from version 12 (CiRCLE):

```bash
curl "https://yourdomain.com/api/admin/import?from=version<=12@jp-12&to=jp-13" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

This copies all songs where `addedVersion <= 12` from `jp-12` to `jp-13`. The `from` parameter format is `version[<=|>=|=]NUMBER@[intl|jp]-VERSION_ID` and the `to` parameter format is `[intl|jp]-VERSION_ID`.

After importing, run the [songs update](#populating-songs-data) for that region to pull in any new songs added in the new version.

## Populating Events Data

After populating songs, fetch event data (requires `OPENROUTER_KEY` to be set):

```bash
curl -X POST "https://yourdomain.com/api/admin/events/fetch" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

After running this, check the Discord channel configured for `DISCORD_UPDATE_WEBHOOK_NOTICE` and click **Confirm** to approve the fetched events.
