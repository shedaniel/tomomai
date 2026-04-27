# tomomai cn-proxy

A minimal HTTP forward proxy that intercepts the maimai DX (CN) WeChat OAuth callback so the backend can finish the login flow without hitting `maimai.wahlap.com` from outside China.

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
node main.js
```

Env vars:

| name | default | meaning |
|---|---|---|
| `PROXY_PORT` | `2560` | listen port |
| `PROXY_HOST` | `0.0.0.0` | listen iface |
| `WEBHOOK_URL` | _(unset)_ | backend endpoint that receives `{ r, code, state, t, callbackUrl, maimaiLoginUrl, maimaiToken }`; if unset, payload is just logged |
| `RESULT_URL` | **required** | base URL of the result page (e.g. `https://tomomai.lol/cn-proxy/result`); the proxy appends `?type=done` on success and `?type=error` on failure |

The `RESULT_URL` hostname is automatically added to the whitelist so the user's WeChat browser can reach it through the proxy after the 302.

## Deployment

Bind on a host reachable from the user's phone (mainland-CN or HK). Standard pattern: a small Aliyun/Vercel-VPS-equivalent box with port 2560 open in the firewall. The proxy itself is one Node process, no DB, no state.
