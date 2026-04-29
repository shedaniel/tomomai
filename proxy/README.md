# tomomai cn-proxy

A minimal HTTP forward proxy written in Go that intercepts the maimai DX (CN) WeChat OAuth callback so the backend can finish the login flow without hitting `maimai.wahlap.com` from outside China. Single static binary (~10MB RSS idle).

## How it works

1. The frontend asks the backend for a "proxy auth link" — the backend hits `https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx`, takes the WeChat redirect URL out of the `Location` header, and rewrites `redirect_uri=https%3A%2F%2F…` → `redirect_uri=http%3A%2F%2F…`. The session token (`r`) tying this auth attempt to the user is part of that URL.
2. The user sets the device-wide HTTP proxy on their phone to this server's `host:2560` and opens the link inside WeChat.
3. WeChat completes OAuth and 302's the in-app browser to `http://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?r=…&code=…&state=…`. Because that's plain HTTP, it goes through the proxy.
4. The proxy reads `r`/`code`/`state` off the URL, POSTs them to the configured backend webhook, and 302's the user's browser to the tomomai status page.
5. The backend uses `code` to call the maimai login endpoint (over HTTPS, server-to-server, from a CN-routed host) and stores the resulting cookies/token against the user identified by `r`.

The proxy is whitelist-only (wahlap, weixin, baidu CDN). Non-whitelisted hosts are rejected with 403. HTTPS goes through `CONNECT` tunnelling without TLS MITM.

## Run locally

```sh
cd proxy
PROXY_PORT=2560 \
WEBHOOK_URL=http://localhost:3000/api/cn-proxy/callback \
RESULT_URL=http://localhost:3000/cn-proxy/result \
go run .
```

Or build a binary:
```sh
cd proxy
go build -ldflags="-s -w" -o cn-proxy .
./cn-proxy  # (with env vars as above)
```

Env vars:

| name | default | meaning |
|---|---|---|
| `PROXY_PORT` | `2560` | listen port |
| `PROXY_HOST` | `0.0.0.0` | listen iface |
| `WEBHOOK_URL` | _(unset)_ | backend endpoint that receives `{ r, code, state, t, token, callbackUrl, maimaiLoginUrl, maimaiToken }`; if unset, payload is just logged |
| `RESULT_URL` | **required** | base URL of the result page (e.g. `https://tomomai.lol/cn-proxy/result`); the proxy appends `?type=done` on success and `?type=error` on failure |
| `VERCEL_BYPASS_TOKEN` | _(unset)_ | optional Vercel share-protection token (the bit after `?_vercel_share=` in a Generate-Link URL). The proxy appends it as `_vercel_share=…` on webhook POSTs (cookie-jar-aware HTTP client follows the Vercel 307 and persists the resulting `_vercel_jwt` cookie) and on the result-URL redirect (so the user's WeChat browser also bypasses Vercel auth). NOTE: this is NOT the "Protection Bypass for Automation" header secret — that's a different Vercel feature with a different token |

The `RESULT_URL` hostname is automatically added to the whitelist so the user's WeChat browser can reach it through the proxy after the 302.

## Deployment

`deploy.sh` is a small CLI that manages the proxy on a remote Ubuntu host over SSH. It cross-compiles a static Linux binary locally, ships it via `scp`, installs a `tomomai-proxy.service` systemd unit (running as `nobody`, `MemoryMax=64M`), and opens the port in `ufw` if active.

```sh
./deploy.sh install [user@host[:port]]   # build, ship, (re)install — idempotent
./deploy.sh status  [user@host[:port]]   # systemctl status
./deploy.sh logs    [user@host[:port]]   # journalctl -u tomomai-proxy -f
./deploy.sh remove  [user@host[:port]]   # stop, uninstall, remove files + ufw rule
./deploy.sh check   [host[:port]]        # probe the public proxy (no SSH)
./deploy.sh help
```

`install` prompts for the tomomai base URL, `PROXY_PORT`, and target arch (`amd64` / `arm64`). Re-run to update — it stops the unit, swaps the binary, and restarts. The SSH target is prompted for if omitted; default SSH port is 22.

Before building, `install` also `curl`s `$BASE_URL/` to make sure the backend is publicly reachable. If it returns 401/403 with a Vercel auth gate body, you'll be prompted to paste a share link (e.g. `https://preview.tomomai.lol?_vercel_share=…`); the token is parsed out, re-verified by repeating the probe with the token (cookie-jar-aware, just like the proxy itself), and persisted to the systemd unit as `Environment=VERCEL_BYPASS_TOKEN=…`. The proxy then appends `_vercel_share=…` to every webhook POST and to the user's result-URL redirect, so OAuth codes don't get silently consumed by Vercel's protection page. Type `skip` (or just hit enter) at the prompt to deploy without a bypass — handy for testing the proxy itself when you don't care that the webhook will 401.

**Failure routing.** When something goes wrong inside the OAuth callback handler, the proxy redirects the user to `$RESULT_URL?type=error&reason=<reason>` instead of silently 302-ing to the success page. Reasons currently emitted: `missing_params` (the WeChat redirect didn't carry `r`/`code`), `wahlap_unreachable` (the proxy couldn't reach `tgk-wcaime.wahlap.com` to consume the OAuth code), `consume_<status>` (wahlap returned a non-302 response, e.g. `consume_404` for a stale/already-consumed code), and `webhook_failed` (the backend rejected the POST or was unreachable). The result page can render a useful message off `reason=`.

`check` runs four probes against the public `host:port` of a deployed proxy: HTTP 403 on a non-whitelisted host, HTTP success on `tgk-wcaime.wahlap.com` (catches the "proxy is up but not on a CN-routed host" case → 502), HTTPS CONNECT through to `open.weixin.qq.com`, and HTTPS CONNECT rejected for a non-whitelisted host. No SSH required — useful from your laptop or CI.

To deploy manually instead:

1. Cross-compile: `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o cn-proxy .` (use `GOARCH=arm64` for ARM VPS)
2. Copy the binary to `/opt/tomomai-proxy/cn-proxy` on the target host
3. Set up a systemd unit with the env vars and `ExecStart=/opt/tomomai-proxy/cn-proxy`

The proxy is a single static binary — no Go toolchain, libc, or Node needed on the target. No DB, no state. Requires only the chosen `PROXY_PORT` open in the firewall / cloud security group.
