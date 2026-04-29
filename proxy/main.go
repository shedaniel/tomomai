// tomomai cn-proxy — Go port of main.js. Single static binary, ~10MB RSS idle.
// Behaviour matches the Node version: whitelist-only HTTP forward proxy with
// HTTPS CONNECT tunnelling (no TLS MITM) and interception of the maimai DX
// WeChat OAuth callback.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

var (
	proxyPort  = envOr("PROXY_PORT", "2560")
	proxyHost  = envOr("PROXY_HOST", "0.0.0.0")
	webhookURL = os.Getenv("WEBHOOK_URL")
	resultURL  = os.Getenv("RESULT_URL")

	// Optional. If the backend is behind Vercel deployment protection, set
	// this to a *share-protection* token (the bit after `?_vercel_share=`
	// in a Generate-Link URL). We append it as `_vercel_share=<token>`
	// query param to webhook POSTs and to the result-URL redirect — both
	// the proxy's own HTTP client and the user's WeChat browser get a
	// `_vercel_jwt` cookie from Vercel's edge that lasts 7 days.
	//
	// Note: this is NOT the "Protection Bypass for Automation" header
	// secret (`x-vercel-protection-bypass`); they're separate Vercel
	// features with separate tokens.
	vercelBypassToken = os.Getenv("VERCEL_BYPASS_TOKEN")

	successRedirect string

	whitelist = map[string]bool{
		"tgk-wcaime.wahlap.com": true,
		"open.weixin.qq.com":    true,
		"weixin110.qq.com":      true,
		"res.wx.qq.com":         true,
		"mp.weixin.qq.com":      true,
		"libs.baidu.com":        true,
	}

	// HTTP client that does NOT follow redirects (we need the 302 Location).
	noRedirect = &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// Webhook client follows redirects (Vercel edge 307s after consuming
	// `_vercel_share=`) and persists the resulting `_vercel_jwt` cookie
	// across calls so we don't pay the redirect cost every time. Cookie
	// jar is initialised in main() — `cookiejar.New` returns an error
	// signature that doesn't compose nicely with var blocks.
	webhookClient *http.Client
)

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// buildResultURL returns RESULT_URL?type=<typ>[&reason=<reason>]
// [&_vercel_share=<token>]. `reason` is only emitted for error redirects so
// the result page can show a useful failure message instead of a generic
// "something went wrong".
func buildResultURL(typ, reason string) string {
	u, err := url.Parse(resultURL)
	if err != nil {
		log.Fatalf("invalid RESULT_URL: %v", err)
	}
	q := u.Query()
	q.Set("type", typ)
	if reason != "" {
		q.Set("reason", reason)
	}
	if vercelBypassToken != "" {
		// Vercel's edge sees `_vercel_share=<token>` and sets a session
		// cookie so the rest of the redirected page loads work without
		// re-prompting for auth.
		q.Set("_vercel_share", vercelBypassToken)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// errorURL is a thin wrapper for readability at the call sites in
// handleAuthCallback — every error path produces a URL of the same shape.
func errorURL(reason string) string {
	return buildResultURL("error", reason)
}

func hostAllowed(target string) bool {
	if target == "" {
		return false
	}
	host := strings.ToLower(strings.SplitN(target, ":", 2)[0])
	return whitelist[host]
}

// postWebhook delivers the OAuth callback payload to the configured backend.
// Returns nil on 2xx, an error otherwise. Callers route the user to the
// failure screen on a non-nil error so problems aren't buried in the journal.
func postWebhook(payload map[string]any) error {
	if webhookURL == "" {
		log.Printf("webhook skipped (WEBHOOK_URL unset): %v", payload)
		return nil
	}
	target := webhookURL
	if vercelBypassToken != "" {
		// Append `_vercel_share=<token>` to the URL. Vercel's edge then
		// 307-redirects to the same URL without the param after issuing
		// a `_vercel_jwt` cookie; webhookClient follows the redirect
		// (RFC 7231 307 preserves method+body) carrying the cookie, so
		// the underlying serverless function actually sees the POST.
		if u, err := url.Parse(webhookURL); err == nil {
			q := u.Query()
			q.Set("_vercel_share", vercelBypassToken)
			u.RawQuery = q.Encode()
			target = u.String()
		}
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", target, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build webhook request: %w", err)
	}
	req.Header.Set("content-type", "application/json")

	res, err := webhookClient.Do(req)
	if err != nil {
		return fmt.Errorf("webhook transport: %w", err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 200))
	log.Printf("webhook %d: %s", res.StatusCode, b)
	if res.StatusCode >= 400 {
		return fmt.Errorf("webhook status %d", res.StatusCode)
	}
	return nil
}

// Replays the OAuth callback over HTTPS to consume the single-use code; we
// must not follow the 302 — the Location carries the maimai login token in `t`.
func consumeOAuthCallback(httpsCallbackURL string) (location, token string, status int, ok bool) {
	req, err := http.NewRequest("GET", httpsCallbackURL, nil)
	if err != nil {
		return "", "", 0, false
	}
	req.Header.Set("Host", "tgk-wcaime.wahlap.com")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7")

	res, err := noRedirect.Do(req)
	if err != nil {
		return "", "", 0, false
	}
	defer res.Body.Close()
	io.Copy(io.Discard, res.Body)

	loc := res.Header.Get("Location")
	if res.StatusCode != 302 || loc == "" {
		return loc, "", res.StatusCode, false
	}
	if u, err := url.Parse(loc); err == nil {
		token = u.Query().Get("t")
	}
	return loc, token, res.StatusCode, token != ""
}

func handleAuthCallback(reqURL *url.URL, w http.ResponseWriter) {
	q := reqURL.Query()
	r := q.Get("r")
	code := q.Get("code")
	state := q.Get("state")
	t := q.Get("t")
	tok := q.Get("token")

	log.Printf("oauth callback intercepted r=%s code=%.8s… state=%.8s…", r, code, state)

	if r == "" || code == "" {
		log.Printf("oauth callback rejected: missing r or code")
		http.Redirect(w, &http.Request{}, errorURL("missing_params"), http.StatusFound)
		return
	}

	httpsCallback := "https://tgk-wcaime.wahlap.com" + reqURL.Path + "?" + reqURL.RawQuery
	loc, maimaiToken, status, ok := consumeOAuthCallback(httpsCallback)
	if !ok {
		log.Printf("oauth consume failed status=%d location=%s", status, loc)
		// Distinguish "couldn't reach wahlap" (status==0) from "wahlap
		// rejected the code" so the result page can show something
		// useful.
		reason := "consume_failed"
		if status == 0 {
			reason = "wahlap_unreachable"
		} else {
			reason = fmt.Sprintf("consume_%d", status)
		}
		http.Redirect(w, &http.Request{}, errorURL(reason), http.StatusFound)
		return
	}
	log.Printf("oauth consumed; maimai token=%.12s…", maimaiToken)

	if err := postWebhook(map[string]any{
		"r":              r,
		"code":           code,
		"state":          state,
		"t":              t,
		"token":          tok,
		"callbackUrl":    httpsCallback,
		"maimaiLoginUrl": loc,
		"maimaiToken":    maimaiToken,
	}); err != nil {
		log.Printf("webhook failed: %v — redirecting user to error page", err)
		// Webhook failure is the worst kind: we already consumed the
		// single-use OAuth code with wahlap, so the user can't retry —
		// they'd need a fresh auth link from the frontend. The result
		// page should explain that and offer a "try again" button.
		http.Redirect(w, &http.Request{}, errorURL("webhook_failed"), http.StatusFound)
		return
	}

	http.Redirect(w, &http.Request{}, successRedirect, http.StatusFound)
}

// Plain HTTP pass-through (whitelist only, no body buffering).
func passthrough(w http.ResponseWriter, r *http.Request, target *url.URL) {
	port := target.Port()
	if port == "" {
		port = "80"
	}
	outURL := *target
	req, err := http.NewRequest(r.Method, outURL.String(), r.Body)
	if err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	req.Host = target.Host
	for k, vs := range r.Header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	res, err := noRedirect.Do(req)
	if err != nil {
		log.Printf("upstream error: %v", err)
		http.Error(w, "bad gateway", 502)
		return
	}
	defer res.Body.Close()
	for k, vs := range res.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(res.StatusCode)
	io.Copy(w, res.Body)
	_ = port
}

// CONNECT tunnel — raw TCP, no TLS termination.
func handleConnect(w http.ResponseWriter, r *http.Request) {
	host, portStr, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
		portStr = "443"
	}
	if !hostAllowed(host) {
		http.Error(w, "host not allowed", 403)
		return
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 443
	}

	upstream, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), 10*time.Second)
	if err != nil {
		log.Printf("connect upstream error: %v", err)
		http.Error(w, "bad gateway", 502)
		return
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack unsupported", 500)
		upstream.Close()
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		log.Printf("hijack error: %v", err)
		upstream.Close()
		return
	}

	_, _ = client.Write([]byte("HTTP/1.1 200 Connection Established\r\nProxy-agent: tomomai-cn-proxy\r\n\r\n"))
	go func() { defer upstream.Close(); defer client.Close(); io.Copy(upstream, client) }()
	go func() { defer upstream.Close(); defer client.Close(); io.Copy(client, upstream) }()
}

func handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		handleConnect(w, r)
		return
	}

	target, err := url.Parse(r.RequestURI)
	if err != nil || target.Host == "" {
		http.Error(w, "bad request", 400)
		return
	}

	if !hostAllowed(target.Host) {
		http.Error(w, "host not allowed", 403)
		return
	}

	if target.Hostname() == "tgk-wcaime.wahlap.com" &&
		strings.HasPrefix(target.Path, "/wc_auth/oauth/callback/") {
		handleAuthCallback(target, w)
		return
	}

	passthrough(w, r, target)
}

func main() {
	if resultURL == "" {
		log.Fatal("RESULT_URL env var is required.")
	}
	successRedirect = buildResultURL("done", "")

	jar, err := cookiejar.New(nil)
	if err != nil {
		log.Fatalf("cookiejar init: %v", err)
	}
	webhookClient = &http.Client{
		Timeout: 15 * time.Second,
		Jar:     jar,
	}

	if u, err := url.Parse(resultURL); err == nil {
		whitelist[strings.ToLower(u.Hostname())] = true
	}

	addr := net.JoinHostPort(proxyHost, proxyPort)
	srv := &http.Server{
		Addr:        addr,
		Handler:     http.HandlerFunc(handler),
		ReadTimeout: 0, // CONNECT tunnels live for the OAuth flow
	}

	log.SetFlags(0)
	log.SetOutput(&tsWriter{out: os.Stdout})
	log.Printf("tomomai cn-proxy listening on %s", addr)
	if webhookURL == "" {
		log.Printf("webhook: (disabled — set WEBHOOK_URL to forward callbacks)")
	} else {
		log.Printf("webhook: %s", webhookURL)
	}
	if vercelBypassToken != "" {
		log.Printf("vercel bypass: enabled (token len=%d)", len(vercelBypassToken))
	}
	keys := make([]string, 0, len(whitelist))
	for k := range whitelist {
		keys = append(keys, k)
	}
	log.Printf("whitelist: %s", strings.Join(keys, ", "))

	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

type tsWriter struct{ out io.Writer }

func (t *tsWriter) Write(p []byte) (int, error) {
	return fmt.Fprintf(t.out, "[%s] %s", time.Now().UTC().Format(time.RFC3339Nano), p)
}
