import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 2560);
const PROXY_HOST = process.env.PROXY_HOST ?? "0.0.0.0";

// URL the proxy POSTs intercepted callback params to. The backend uses `r` to
// look up the pending session, completes the maimai login with `code`, and
// stores the resulting token.
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";

// Base URL the user's WeChat browser is 302'd to after we intercept the
// callback. The proxy appends `?type=done` on success and `?type=error` on
// failure. Existing query params on RESULT_URL are preserved.
const RESULT_URL = process.env.RESULT_URL;

if (!RESULT_URL) {
  console.error("RESULT_URL env var is required.");
  process.exit(1);
}

function buildResultUrl(type) {
  const u = new URL(RESULT_URL);
  u.searchParams.set("type", type);
  return u.toString();
}

const SUCCESS_REDIRECT = buildResultUrl("done");
const ERROR_REDIRECT = buildResultUrl("error");

const WHITELIST = new Set([
  "tgk-wcaime.wahlap.com",
  "open.weixin.qq.com",
  "weixin110.qq.com",
  "res.wx.qq.com",
  "mp.weixin.qq.com",
  "libs.baidu.com",
  new URL(RESULT_URL).hostname.toLowerCase(),
]);

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

function hostAllowed(target) {
  if (!target) return false;
  const host = target.split(":")[0].toLowerCase();
  return WHITELIST.has(host);
}

async function postWebhook(payload) {
  if (!WEBHOOK_URL) {
    log("webhook skipped (WEBHOOK_URL unset):", payload);
    return { ok: true };
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    log(`webhook ${res.status}: ${text.slice(0, 200)}`);
    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    log("webhook error:", err);
    return { ok: false, error: String(err) };
  }
}

async function consumeOAuthCallback(httpsCallbackUrl) {
  // Replay the callback ourselves over HTTPS to consume the single-use OAuth
  // code. Wahlap responds with a 302 to maimai-mobile carrying the actual
  // login token in `?t=…`. We must NOT follow the redirect (the user's
  // browser is the one that should ultimately land on maimai if needed; we
  // just want the token).
  const res = await fetch(httpsCallbackUrl, {
    redirect: "manual",
    headers: {
      "Host": "tgk-wcaime.wahlap.com",
      "Upgrade-Insecure-Requests": "1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
  const location = res.headers.get("location");
  if (res.status !== 302 || !location) {
    return { ok: false, status: res.status, location };
  }
  let maimaiToken = null;
  try {
    maimaiToken = new URL(location).searchParams.get("t");
  } catch {
    // ignore; location may be malformed
  }
  return { ok: !!maimaiToken, status: res.status, location, maimaiToken };
}

async function handleAuthCallback(reqUrl, clientRes) {
  const parsed = new URL(reqUrl);
  const r = parsed.searchParams.get("r");
  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");
  const t = parsed.searchParams.get("t");
  const token = parsed.searchParams.get("token");

  log(`oauth callback intercepted r=${r} token=${token ? "yes" : "no"} code=${code?.slice(0, 8)}… state=${state?.slice(0, 8)}…`);

  if (!r || !code) {
    clientRes.writeHead(302, { location: ERROR_REDIRECT });
    clientRes.end();
    return;
  }

  const httpsCallback = `https://tgk-wcaime.wahlap.com${parsed.pathname}${parsed.search}`;
  const consumed = await consumeOAuthCallback(httpsCallback);
  if (!consumed.ok) {
    log(`oauth consume failed status=${consumed.status} location=${consumed.location}`);
    clientRes.writeHead(302, { location: ERROR_REDIRECT });
    clientRes.end();
    return;
  }
  log(`oauth consumed; maimai token=${consumed.maimaiToken?.slice(0, 12)}…`);

  await postWebhook({
    r,
    code,
    state,
    t,
    token,
    callbackUrl: httpsCallback,
    maimaiLoginUrl: consumed.location,
    maimaiToken: consumed.maimaiToken,
  });

  clientRes.writeHead(302, { location: SUCCESS_REDIRECT });
  clientRes.end();
}

const server = http.createServer(async (clientReq, clientRes) => {
  clientReq.on("error", (e) => log("client req error:", e.message));

  let target;
  try {
    target = new URL(clientReq.url);
  } catch {
    clientRes.writeHead(400);
    clientRes.end("bad request");
    return;
  }

  if (!hostAllowed(target.host)) {
    clientRes.writeHead(403);
    clientRes.end("host not allowed");
    return;
  }

  // The interception target. Note the path prefix used by Wahlap's OAuth.
  if (
    target.hostname === "tgk-wcaime.wahlap.com" &&
    target.pathname.startsWith("/wc_auth/oauth/callback/")
  ) {
    try {
      await handleAuthCallback(clientReq.url, clientRes);
    } catch (err) {
      log("callback handler error:", err);
      try {
        clientRes.writeHead(302, { location: ERROR_REDIRECT });
        clientRes.end();
      } catch { /* ignore */ }
    }
    return;
  }

  // Plain HTTP pass-through for other whitelisted hosts.
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: clientReq.method,
      headers: clientReq.headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );
  upstream.on("error", (e) => {
    log("upstream error:", e.message);
    try {
      clientRes.writeHead(502);
      clientRes.end();
    } catch { /* ignore */ }
  });
  clientReq.pipe(upstream);
});

// HTTPS CONNECT tunnelling for WeChat OAuth pages etc. We do NOT MITM TLS.
server.on("connect", (clientReq, clientSocket, head) => {
  clientSocket.on("error", (e) => log("connect socket error:", e.message));

  const [hostname, portStr] = clientReq.url.split(":");
  const port = Number(portStr) || 443;

  if (!hostAllowed(hostname)) {
    clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }

  const upstream = net.connect(port, hostname, () => {
    clientSocket.write(
      "HTTP/1.1 200 Connection Established\r\nProxy-agent: tomomai-cn-proxy\r\n\r\n",
    );
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", (e) => {
    log("connect upstream error:", e.message);
    try {
      clientSocket.end();
    } catch { /* ignore */ }
  });
});

server.on("clientError", (err, sock) => {
  log("client error:", err.message);
  try {
    sock.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  } catch { /* ignore */ }
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  log(`tomomai cn-proxy listening on ${PROXY_HOST}:${PROXY_PORT}`);
  log(`webhook: ${WEBHOOK_URL || "(disabled — set WEBHOOK_URL to forward callbacks)"}`);
  log(`whitelist: ${[...WHITELIST].join(", ")}`);
});
