# @tomomai/userscript

A userscript (Tampermonkey / Violentmonkey / Greasemonkey) that augments
`maimaidx.jp` and `maimaidx-eng.com` with a tomomai overlay. It runs inside a
shadow DOM on those pages and authenticates against the tomomai backend via
OAuth 2.0.

## Architecture at a glance

- Built with Vite + `vite-plugin-monkey`. Output: `dist/@tomomai/userscript.user.js`.
- Served to users by the Next.js route [`/userscript.user.js`](../../src/app/userscript.user.js/route.ts).
  That route patches two placeholders into the prebuilt bundle on every request,
  so a single build artifact works across local / preview / production.

| Placeholder                          | Source at serve time                                | Used by                          |
| ------------------------------------ | --------------------------------------------------- | -------------------------------- |
| `__TOMOMAI_API_BASE__`               | `resolveBaseUrlFromHeaders(request.headers)`        | `__API_BASE__` in `src/auth.ts`  |
| `__TOMOMAI_USERSCRIPT_CLIENT_ID__`   | `process.env.USERSCRIPT_CLIENT_ID`                  | `__USERSCRIPT_CLIENT_ID__`       |

The client *secret* never ships to the browser — it's used only by the
server-side token endpoint at [`/api/userscript/token`](../../src/app/api/userscript/token/route.ts)
to exchange the authorization code (plus the userscript's PKCE verifier) for
tokens.

### Auth flow

1. Userscript generates a PKCE `code_verifier` + `code_challenge` and a random
   `state`, keeps the verifier in memory, and opens a popup at
   `${base}/api/auth/oauth2/authorize?...&code_challenge=...&code_challenge_method=S256`.
2. The user consents in the popup. Better Auth redirects the popup to
   [`/userscript/callback`](../../src/app/userscript/callback/route.ts) with
   `?code=...&state=...`.
3. That callback page is a thin relay: it `postMessage`s `{code, state}` (or
   `{error}`) back to the opener window and closes itself.
4. The userscript receives the message, looks up the verifier it stashed for
   this `state`, then `POST`s `{code, code_verifier, redirect_uri}` to
   [`/api/userscript/token`](../../src/app/api/userscript/token/route.ts) via
   `GM_xmlhttpRequest`.
5. That route attaches `client_id` + `client_secret` from server env and forwards
   to Better Auth's `/api/auth/oauth2/token`, returning the access token to
   the userscript.

### How API endpoints verify the token

[`src/lib/api/protect.ts`](../../src/lib/api/protect.ts) accepts both shapes of
OAuth access token Better Auth can issue, so a third-party OAuth app just does
standard OAuth 2.1 with PKCE — no extra parameters required:

- **Opaque tokens** (the default for any OAuth client): validated via a single
  indexed lookup against the `oauthAccessToken` table, applying the same
  SHA-256/base64url hash Better Auth uses at write time. Works for tokens
  issued to any OAuth client without per-app credentials.
- **JWT tokens** (opt-in optimization): a client that sends
  `resource=<base url>` at the token endpoint per
  [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) gets back a JWT
  access token, which we verify locally via `/api/auth/jwks`. No DB hit. The
  userscript opts into this — see [`/api/userscript/token`](../../src/app/api/userscript/token/route.ts) —
  but it's never required.

Both paths enforce required scopes and the `expiresAt` claim.

## First-time setup

### 1. Register an OAuth application

The userscript authenticates as a registered OAuth client. You need to create
one and record both the client ID and secret.

1. Run the tomomai web app (`pnpm dev` at the repo root) and sign in.
2. Open **Settings → Developer** (`/settings/developer`).
3. Create an OAuth application with:
   - **Name:** anything (e.g. `tomomai userscript (local)`).
   - **Redirect URIs:** must include **every** origin you serve the userscript
     from. At minimum:
     - `http://localhost:3000/userscript/callback` (local dev)
     - `https://tomomai.lol/userscript/callback` (production, if applicable)
   - **Scopes:** at least `user:metadata:read` (this is what `openLoginPopup`
     in [`src/auth.ts`](src/auth.ts) requests). Add more if you extend the
     userscript to call other endpoints.
4. Copy the generated `client_id` and `client_secret` — the secret is shown
   only once.

> If the redirect URI sent at runtime doesn't exactly match one of the URIs you
> registered, Better Auth responds with `invalid_redirect` and bounces the user
> to `/api/auth/error`. The userscript sends `${__API_BASE__}/userscript/callback`,
> so the registered URI must match scheme, host, port, and path exactly.

### 2. Set the server env vars

Add to `.env.local` (or whichever env file your Next.js server reads):

```env
USERSCRIPT_CLIENT_ID=...     # from step 1
USERSCRIPT_CLIENT_SECRET=... # from step 1
```

Both are read on the server only:
- `USERSCRIPT_CLIENT_ID` is substituted into the bundle by the
  `/userscript.user.js` route. If unset, the route responds 500 with a clear
  error rather than shipping a bundle with an empty `client_id`.
- `USERSCRIPT_CLIENT_SECRET` is used by `/userscript/callback` during the
  authorization-code exchange.

Restart the Next.js dev server after editing env files.

### 3. Build the userscript

```sh
pnpm --filter @tomomai/userscript build
```

This produces `packages/userscript/dist/@tomomai/userscript.user.js`. The
Next.js route reads this file from disk on each request and patches in the
placeholders, so you only need to rebuild when *userscript source code*
changes — not when the API base URL or client ID changes.

### 4. Install it in your browser

With the tomomai server running, navigate to:

- Local: <http://localhost:3000/userscript.user.js>
- Production: <https://tomomai.lol/userscript.user.js>

Tampermonkey / Violentmonkey will detect the `// ==UserScript==` header and
prompt to install. After installing, visit `https://maimaidx.jp/` (or the
English site); the overlay should mount and the login button should kick off
the OAuth popup.

## Local development loop

For iterating on the userscript itself, the fastest loop is:

```sh
pnpm --filter @tomomai/userscript build --watch
```

The Next.js route serves whatever the latest build wrote to `dist/`, so a
hard refresh (or "Update" in your userscript manager) picks up changes.

Pure HMR via `pnpm --filter @tomomai/userscript dev` is also possible but
doesn't go through the placeholder-substitution flow — you'd have to set the
client ID yourself.

## Troubleshooting

**`?error=invalid_client&error_description=client_id+is+required`**
The bundle still has the placeholder (or an empty string) where the client ID
should be. Confirm `USERSCRIPT_CLIENT_ID` is set in the server env and that
you rebuilt after pulling the placeholder-substitution change.

**`?error=invalid_redirect`**
The redirect URI in the registered OAuth application doesn't match
`${baseUrl}/userscript/callback`. Open Settings → Developer, edit the app,
and add the exact URL the userscript is sending. Check the dev console
network tab to see what `redirect_uri` was sent.

**`server_misconfigured` from `/api/userscript/token`**
`USERSCRIPT_CLIENT_ID` or `USERSCRIPT_CLIENT_SECRET` is unset on the server.
See step 2.

**`pkce is required for this client`**
Hitting `/api/auth/error` with this message means the userscript built before
the PKCE change is being served. Run `pnpm --filter @tomomai/userscript build`
and reinstall the userscript (Tampermonkey → check for updates).

**`downloadable font: download failed ... bad URI or cross-site access not allowed`**
The font CORS allowlist in [`src/middleware.ts`](../../src/middleware.ts)
only permits `https://maimaidx.jp` and `https://maimaidx-eng.com`. If you're
testing on another origin, add it there.

**Bundle 404 from the Next.js route**
You haven't built the userscript yet. Run `pnpm --filter @tomomai/userscript build`.
