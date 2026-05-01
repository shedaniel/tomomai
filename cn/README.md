# tomomai cn

A Caddy reverse-proxy that fronts the production Vercel deployment from a CN-routed server (e.g. an HK box on a CN2 line) so users in mainland China bypass Cloudflare's anycast and reach the app over a stable ~40ms RTT path. TLS is terminated on the proxy box; `_next/static/*` and `/_next/image` are edge-cached locally to save CN2 bandwidth. Proxies whatever upstream you point it at — `cn.tomomai.lol` for tomomai, but generalises cleanly to other deployments (see [Generalising to your own domain](#generalising-to-your-own-domain)).

## How it works

1. The user's browser resolves `cn.tomomai.lol` to the HK box (gray-cloud A record in Cloudflare — DNS only, no proxy). CN clients on China Telecom / Unicom / Mobile get the CN2 path; international clients are not expected here.
2. Caddy on the HK box terminates TLS using a Let's Encrypt cert auto-provisioned via HTTP-01 on port 80.
3. Requests to `/_next/static/*` (immutable, content-hashed Next.js bundles) and `/_next/image*` (URL-keyed image optimiser) are served from Caddy's local Souin cache when warm; misses are forwarded to the upstream and stored. The `X-Cn-Cache: HIT|MISS|STALE` header reports what happened.
4. Everything else is reverse-proxied to the upstream over HTTPS. The original `Host:` header is preserved, so when `cn.tomomai.lol` is added as a domain alias on the upstream Vercel project, Vercel routes the request as if it came in directly. `X-Forwarded-For` / `X-Real-IP` carry the real client IP, which `src/lib/security/rate-limiter.ts` reads.
5. App-side, `resolveBaseUrlFromHeaders()` reads `x-forwarded-host` so canonical URLs and OAuth redirect URIs stay on `cn.tomomai.lol` for users who came in via the proxy. Better Auth cookies are scoped to `.tomomai.lol` (apex), so a session set on either hostname works on both.

HTTP/3 (QUIC over UDP/443) is enabled — it's a measurable win on lossy CN mobile links.

## Run locally

Two flavours of "local": pure Caddyfile validation (no HK box), and end-to-end testing against the real HK box with `pnpm dev` as the upstream (via a tunnel).

### Pure Caddyfile sanity check (no HK box)

For iterating on the template without a real domain — listen on `:8443` with self-signed TLS, proxy to your local Next.js:

```sh
cd cn
sed \
  -e 's|{{PROXY_DOMAIN}}|localhost:8443|g' \
  -e 's|{{UPSTREAM}}|localhost:3000|g' \
  -e 's|{{ACME_EMAIL}}|me@example.com|g' \
  -e 's|{{STATIC_TTL}}|10m|g' \
  -e 's|{{IMAGE_TTL}}|1m|g' \
  Caddyfile.tmpl > Caddyfile.local
# Edit Caddyfile.local: replace the `https://localhost:3000` upstream with
# `http://localhost:3000` (no TLS to localhost), and add `tls internal` to
# the site block so Caddy issues itself a local cert.
caddy run --config Caddyfile.local --adapter caddyfile
# In another shell:
pnpm dev
# Then: curl -k https://localhost:8443/api/v1/ok
```

Caches will be very small here (10m / 1m TTLs) so you can see HIT→MISS quickly.

### End-to-end against the real HK box (with tunnel)

This is what you want when validating the *actual* HK proxy works end-to-end with your local code. The HK box's Caddy needs an HTTPS upstream reachable from HK, so we tunnel `pnpm dev` out via [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (recommended — stable hostname on free tier) or [ngrok](https://ngrok.com).

**Pre-flight (one-time):**

- Pick a stable dev hostname, e.g. `dev.tomomai.lol`. With cloudflared: `cloudflared tunnel create tomomai-dev`, then route `dev.tomomai.lol` to the tunnel via `cloudflared tunnel route dns tomomai-dev dev.tomomai.lol`. With ngrok: pay for a reserved domain.
- Add the dev hostname to your Vercel project's allowed origins by setting `TRUSTED_ORIGINS=https://tomomai.lol,https://cn.tomomai.lol,https://dev.tomomai.lol` locally (in `.env.local`). This makes Better Auth and the CORS layer accept it.
- Add `https://dev.tomomai.lol/api/auth/callback/discord` to your Discord OAuth app's redirect URIs (Discord rejects unknown callbacks).
- For lxns OAuth, set `LXNS_REDIRECT_URI=https://dev.tomomai.lol/api/oauth/lxns/callback` in `.env.local` (or rely on the host-aware fallback — both work).

**Each session:**

```sh
# 1. Start Next.js locally
pnpm dev

# 2. Tunnel it to dev.tomomai.lol (in another shell)
cloudflared tunnel --url http://localhost:3000 run tomomai-dev
# or: ngrok http --domain=your-reserved.ngrok.app 3000

# 3. Point the HK Caddy at the tunnel
cd cn
./deploy.sh update-config user@hk-box
#   proxy domain   : cn.tomomai.lol           (unchanged)
#   upstream domain: dev.tomomai.lol          (was tomomai.lol)
#   ACME email     : (unchanged)
# Caddyfile is re-rendered, validated, swapped in, Caddy reloaded gracefully.

# 4. Drive traffic
curl -v https://cn.tomomai.lol/api/v1/ok
# Hit it from a browser. Requests land on the HK box → Caddy → cloudflared
# → your laptop's pnpm dev. RSC/HMR all work; the cache layer behaves as it
# would in prod.

# 5. Watch logs end-to-end
./deploy.sh logs user@hk-box   # Caddy access log + ACME events
# pnpm dev terminal shows the proxied requests.
```

**When done**, point the HK box back at production:

```sh
./deploy.sh update-config user@hk-box
#   upstream domain: tomomai.lol
```

**Heads-up on caching during dev:** the Souin cache will store responses keyed by URL on the HK box. If you change a `_next/static/*` asset (you won't normally — Next hashes them), or you change `/_next/image` output, you'll see stale responses for up to `STATIC_TTL` / `IMAGE_TTL`. Either bump the cache TTLs way down via `update-config` for dev sessions (`STATIC_TTL=1m`, `IMAGE_TTL=30s`), or `ssh user@hk-box "sudo systemctl restart caddy"` to flush.

**Heads-up on cookies:** `AUTH_COOKIE_DOMAIN=.tomomai.lol` works for `cn.tomomai.lol` ↔ `dev.tomomai.lol` (both subdomains of `tomomai.lol`), so a session signed in via the HK proxy is valid against the dev tunnel and vice versa. If your dev hostname is on a different apex (e.g. `*.ngrok.app`), unset `AUTH_COOKIE_DOMAIN` for the dev session so Better Auth falls back to per-host cookies.

**Heads-up on Better Auth + OAuth redirect URIs:** Better Auth's `advanced.trustedProxyHeaders: true` is set in `src/lib/auth.ts` so OAuth `redirect_uri` is computed from `x-forwarded-host`/`x-forwarded-proto` rather than the local `request.url`. Without it, Discord login from `cn.tomomai.lol` would round-trip back to `http://localhost:3000/api/auth/callback/discord` because that's what the local `pnpm dev` sees on the wire. If you ever set `BETTER_AUTH_URL` in `.env.local`, it overrides the proxy-header path entirely — leave it unset for the dev tunnel flow to work, or set it to your dev tunnel URL.

## Deployment

`deploy.sh` is a small CLI that manages the proxy on a remote Ubuntu host over SSH. It installs Caddy from the official Cloudsmith apt repo, rebuilds it once with the [Souin cache module](https://github.com/caddyserver/cache-handler) via `xcaddy`, renders the Caddyfile from `Caddyfile.tmpl` using values you provide at the prompt, validates it on the remote, then atomically swaps it in and reloads Caddy.

```sh
./deploy.sh install       [user@host[:port]]   # install caddy + render Caddyfile + start
./deploy.sh update-config [user@host[:port]]   # re-render Caddyfile only (no Caddy reinstall)
./deploy.sh status        [user@host[:port]]   # systemctl status caddy
./deploy.sh logs          [user@host[:port]]   # tail journalctl -u caddy -f
./deploy.sh remove        [user@host[:port]]   # purge caddy + Caddyfile + ufw rule
./deploy.sh check         [host]               # probe the public proxy (no SSH)
./deploy.sh help
```

`install` is idempotent — re-run to update. The script:

1. Prompts for `PROXY_DOMAIN`, `UPSTREAM`, `ACME_EMAIL`, and the cache TTLs (sensible defaults; just hit ENTER for tomomai's setup).
2. Sanity-checks DNS for `PROXY_DOMAIN` — warns if it doesn't resolve, since ACME HTTP-01 will fail.
3. SSHs in, installs Caddy via apt if missing, then runs `xcaddy build --with github.com/caddyserver/cache-handler` and replaces `/usr/bin/caddy` if the cache module isn't loaded (one-time bootstrap; subsequent installs detect it and skip).
4. Renders `Caddyfile.tmpl` locally with `sed`, scps it to `/tmp/Caddyfile.new`, runs `caddy validate` against it, and only swaps it into `/etc/caddy/Caddyfile` if validation passes — so a typo in your edits won't take down the running proxy.
5. Reloads Caddy gracefully (`systemctl reload`, no dropped connections).
6. Opens `80/tcp`, `443/tcp`, `443/udp` (HTTP/3) in `ufw` if active.

`update-config` is the same as `install` minus the Caddy-binary work — useful when you're iterating on cache TTLs or adding cached paths.

`check` runs five probes against the public domain (no SSH needed):

1. `GET /api/v1/ok` returns 200 — proves TCP+TLS+upstream reachability end-to-end.
2. Misdirected `Host:` header returns 421/404 — proves the catch-all defence-in-depth handler.
3. HTTP/3 round-trip — proves UDP/443 is open and Caddy is serving QUIC.
4. Edge cache hit on a real `_next/static/*` asset (path discovered by parsing the homepage HTML) — proves Souin is wired up.
5. TLS cert CN matches the proxy domain — catches stale DNS pointing at CF anycast.

To deploy manually instead:

1. Install Caddy from `https://caddyserver.com/docs/install`.
2. Build with the cache module: `xcaddy build --with github.com/caddyserver/cache-handler` and replace `/usr/bin/caddy`.
3. Render `Caddyfile.tmpl` (substitute the `{{PLACEHOLDERS}}`) and write it to `/etc/caddy/Caddyfile`.
4. `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
5. Open `80/tcp`, `443/tcp`, `443/udp` in your firewall and cloud security group.

## Generalising to your own domain

The proxy is parameterised — nothing in `Caddyfile.tmpl` or `deploy.sh` is hardcoded to `tomomai.lol`. To run this for your own deployment:

1. **Pick a proxy hostname** — e.g. `cn.example.com`. This is what users will hit. Add an A record pointing at your CN-routed server (gray-cloud / DNS-only if you're behind Cloudflare; nothing special if you're not).
2. **Add it as a domain alias on your upstream** — for Vercel: Project Settings → Domains → Add `cn.example.com`. Vercel will issue its own cert (which we don't use because Caddy terminates TLS, but Vercel needs the alias to route by Host header). For other hosts: whatever the equivalent is.
3. **Run `./deploy.sh install`** and answer the prompts:
   - `proxy domain`: `cn.example.com`
   - `upstream domain`: your Vercel-direct hostname (e.g. `myproject.vercel.app`), **not** the Cloudflare-fronted apex — see the env-vars table below for why.
   - `ACME email`: an address you own
4. **Set two env vars on your upstream** so the app knows about the new hostname:

   | env var | example value | what reads it |
   |---|---|---|
   | `TRUSTED_ORIGINS` | `https://example.com,https://cn.example.com` | Better Auth `trustedOrigins` and the CORS allowlist in `src/lib/security/config.ts` |
   | `AUTH_COOKIE_DOMAIN` | `.example.com` | Better Auth — pins session cookies to the apex so they're valid on both `example.com` and `cn.example.com`. Omit if you only have one hostname. |

5. **(Optional) Run `./deploy.sh check cn.example.com`** to verify everything is wired up.

That's it. The same `Caddyfile.tmpl` ships unmodified — every literal in the rendered config comes from the prompts.

## Env vars / config

These are the placeholders in `Caddyfile.tmpl` that `deploy.sh install` substitutes:

| name | default | meaning |
|---|---|---|
| `PROXY_DOMAIN` | _(prompted, e.g. `cn.tomomai.lol`)_ | hostname Caddy listens on |
| `UPSTREAM` | _(prompted, e.g. `tomomai-charts.vercel.app`)_ | host we reverse-proxy to. Caddy sends this as the upstream `Host:` header (its default — we don't override). For prod, use a Vercel-direct hostname (the `*.vercel.app` one) so the chain bypasses Cloudflare entirely. For local dev with a cloudflared tunnel, use the tunnel hostname (e.g. `dev.tomomai.lol`) — it goes through CF but CF routes it correctly because Host matches a managed hostname. The app sees the original hostname via `X-Forwarded-Host` regardless, so canonical URLs / OAuth callbacks stay on `cn.tomomai.lol`. |
| `ACME_EMAIL` | _(prompted)_ | Let's Encrypt registration email |
| `STATIC_TTL` | `720h` | edge-cache TTL for `/_next/static/*` (immutable hashed assets — safe forever) |
| `IMAGE_TTL` | `24h` | edge-cache TTL for `/_next/image` (URL-keyed; underlying source can rotate) |

App-side env vars (set on Vercel, not on the proxy box):

| name | example | read by |
|---|---|---|
| `TRUSTED_ORIGINS` | `https://tomomai.lol,https://cn.tomomai.lol` | Better Auth `trustedOrigins`, CORS allowlist |
| `AUTH_COOKIE_DOMAIN` | `.tomomai.lol` | Better Auth `crossSubDomainCookies` — enables cross-subdomain sessions. Omit for single-hostname deployments. |

The proxy is a single Caddy process — no DB, no state. Logs land in `/var/log/caddy/$PROXY_DOMAIN.log` (rolled at 50MB, 7 archives kept). The Souin cache writes to its default location (`/var/cache/caddy` or in-memory; check `caddy list-modules cache` for specifics on your build).
