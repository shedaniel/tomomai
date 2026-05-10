#!/usr/bin/env bash
# tomomai cn-proxy CLI — manage the Go proxy on a remote Ubuntu host over SSH.
#
# Usage:
#   ./deploy.sh install [user@host[:port]]   build, ship, (re)install systemd unit
#   ./deploy.sh status  [user@host[:port]]   show systemd status
#   ./deploy.sh logs    [user@host[:port]]   tail journalctl -f
#   ./deploy.sh remove  [user@host[:port]]   stop + uninstall systemd unit + remove files
#   ./deploy.sh check   [host[:port]]        probe the public proxy endpoint (no SSH)
#   ./deploy.sh help                         this message
#
# `install` is idempotent — re-run to update. `update` is an alias for it.
# SSH target is prompted for if omitted. Defaults: SSH 22, proxy 2560.

set -euo pipefail

cd "$(dirname "$0")"

REMOTE_DIR="/opt/tomomai-proxy"
UNIT="tomomai-proxy"
UNIT_FILE="/etc/systemd/system/${UNIT}.service"

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

die() { echo "error: $*" >&2; exit 1; }

# --- parse subcommand --------------------------------------------------------

CMD="${1:-}"
[ -z "$CMD" ] && { usage; exit 1; }
shift || true

case "$CMD" in
  help|-h|--help) usage; exit 0 ;;
  install|update|status|logs|remove|check) ;;
  *) die "unknown command: $CMD (try: ./deploy.sh help)" ;;
esac

# `check` doesn't talk to the host over SSH — it probes the public proxy.
if [ "$CMD" = "check" ]; then
  cmd_check_dispatch() {
    local target="${1:-}"
    if [ -z "$target" ]; then
      read -rp "proxy host (host[:port], default port 2560): " target
    fi
    [ -z "$target" ] && die "proxy host required"

    local host port
    if [[ "$target" == *:* ]]; then
      host="${target%:*}"
      port="${target##*:}"
    else
      host="$target"
      port="2560"
    fi

    command -v curl >/dev/null 2>&1 || die "curl is required for ./deploy.sh check"

    # Resolve hostname to IP(s) so you can tell which box you're actually
    # hitting (e.g. if `wec.tomomai.lol` has multiple A records or DNS
    # was changed recently). Skip if `host` already looks like an IP.
    local resolved=""
    if [[ ! "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && ! "$host" =~ : ]]; then
      if command -v getent >/dev/null 2>&1; then
        resolved=$(getent ahosts "$host" 2>/dev/null \
          | awk '{print $1}' | sort -u | paste -sd, - || true)
      fi
      if [ -z "$resolved" ] && command -v dig >/dev/null 2>&1; then
        resolved=$(dig +short +time=3 +tries=1 "$host" A "$host" AAAA 2>/dev/null \
          | grep -E '^[0-9a-fA-F.:]+$' | sort -u | paste -sd, - || true)
      fi
      if [ -z "$resolved" ] && command -v host >/dev/null 2>&1; then
        resolved=$(host -W 3 "$host" 2>/dev/null \
          | awk '/has( IPv6)? address/{print $NF}' | sort -u | paste -sd, - || true)
      fi
    fi

    local proxy="http://${host}:${port}"
    if [ -n "$resolved" ] && [ "$resolved" != "$host" ]; then
      echo "==> probing tomomai cn-proxy at ${host}:${port}  (-> ${resolved})"
    else
      echo "==> probing tomomai cn-proxy at ${host}:${port}"
    fi
    echo

    local fail=0
    local total_start
    total_start=$(date +%s.%N 2>/dev/null || date +%s)

    # Runs curl through the proxy. Echoes "<http_code> <time_total>" on
    # stdout (e.g. "200 0.473"). curl's %{http_code} already prints "000"
    # on connection failure, so we just swallow curl's non-zero exit.
    # Stderr is suppressed; on FAIL we re-run with -v to surface the
    # diagnostic.
    # `--http1.1` + `Connection: close` are both required to stop curl
    # from waiting the full --max-time on some upstreams. `Connection:
    # close` is HTTP/1.1 hop-by-hop semantics and gets ignored by h2;
    # ALPN happily upgrades us to h2 (e.g. open.weixin.qq.com), so we
    # have to pin h1.1 first to make the header bite.
    probe_status() {
      curl -sS -o /dev/null -w "%{http_code} %{time_total}" \
        --connect-timeout 5 --max-time 12 \
        --http1.1 -H "Connection: close" \
        -x "$proxy" "$@" 2>/dev/null || true
    }

    # On FAIL, re-runs the same curl with -v and prints the negotiation
    # (request line, response headers, TLS handshake errors, etc.) so
    # whoever runs `check` doesn't have to guess what broke.
    diagnose() {
      echo "    ---- diagnostic (curl -v through proxy) ----"
      curl -sS -v --connect-timeout 5 --max-time 12 \
        --http1.1 -H "Connection: close" \
        -x "$proxy" "$@" -o /dev/null 2>&1 \
        | sed -E 's/^/    /' \
        | head -50
      echo "    --------------------------------------------"
    }

    check() {
      local label="$1" expect_re="$2"; shift 2
      local raw status elapsed
      raw=$(probe_status "$@")
      status="${raw%% *}"
      elapsed="${raw#* }"
      # If curl printed nothing (very rare — sigkill, bash OOM), fall back.
      [ "$raw" = "" ] && { status="000"; elapsed="0"; }
      # Trim trailing zeros for readability: 0.473000 -> 0.473s.
      local pretty_t
      pretty_t=$(printf "%.3fs" "$elapsed" 2>/dev/null || echo "${elapsed}s")
      printf "  %-46s " "$label"
      if [[ "$status" =~ $expect_re ]]; then
        printf "ok   (%s, %s)\n" "$status" "$pretty_t"
      else
        printf "FAIL (got %s, want %s, %s)\n" "$status" "$expect_re" "$pretty_t"
        fail=$((fail+1))
        diagnose "$@"
      fi
    }

    # 1. HTTP, non-whitelisted host → proxy must reply 403.
    #    Proves: TCP reachable, proxy parses HTTP, whitelist enforced.
    check "[1/4] http reject non-whitelisted host" '^403$' \
      http://example.com/

    # 2. HTTPS CONNECT to wahlap → tunnel + TLS handshake must succeed.
    #    This is the real reachability test: in production the proxy
    #    must be on a host that can talk to tgk-wcaime.wahlap.com:443
    #    (CN-routed). Note: wahlap doesn't listen on port 80, so plain
    #    HTTP through the proxy to wahlap is *not* meaningful — the
    #    real OAuth callback over HTTP is intercepted, not passed
    #    through.
    check "[2/4] https connect to wahlap         " '^(2..|3..|4..)$' \
      -I https://tgk-wcaime.wahlap.com/

    # 3. HTTPS CONNECT, whitelisted host → tunnel + TLS handshake must
    #    succeed. open.weixin.qq.com is in the whitelist; this is what
    #    the user's WeChat browser actually goes through.
    check "[3/4] https connect to weixin         " '^(2..|3..|4..)$' \
      -I https://open.weixin.qq.com/

    # 4. HTTPS CONNECT, non-whitelisted host → proxy rejects the CONNECT
    #    with 403 before the tunnel opens. Older curl reports 000, newer
    #    curl surfaces the 403 from the CONNECT response — accept either.
    check "[4/4] https reject non-whitelisted    " '^(403|000)$' \
      -I https://example.com/

    # Total wall-clock for the four probes (rough — includes shell overhead).
    local total_end total_elapsed
    total_end=$(date +%s.%N 2>/dev/null || date +%s)
    total_elapsed=$(awk -v a="$total_start" -v b="$total_end" 'BEGIN{printf "%.2f", b-a}' 2>/dev/null || echo "?")

    echo
    if [ "$fail" -eq 0 ]; then
      echo "==> all checks passed in ${total_elapsed}s."
      exit 0
    else
      echo "==> $fail check(s) failed (total ${total_elapsed}s)."
      echo "    tail logs with:  ./deploy.sh logs <user@host>"
      exit 1
    fi
  }
  cmd_check_dispatch "${1:-}"
  exit 0
fi

# --- ssh target --------------------------------------------------------------

SSH_TARGET="${1:-}"
if [ -z "$SSH_TARGET" ]; then
  read -rp "SSH target (user@host): " SSH_TARGET
fi
[ -z "$SSH_TARGET" ] && die "ssh target required"

SSH_PORT=22
if [[ "$SSH_TARGET" == *:* ]]; then
  SSH_PORT="${SSH_TARGET##*:}"
  SSH_TARGET="${SSH_TARGET%:*}"
fi

# --- shared ssh control-master ----------------------------------------------

CTRL_DIR="$(mktemp -d)"
trap 'ssh -O exit -o ControlPath="$CTRL_DIR/cm" -p "$SSH_PORT" "$SSH_TARGET" 2>/dev/null || true; rm -rf "$CTRL_DIR"; rm -f cn-proxy 2>/dev/null || true' EXIT

SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -p "$SSH_PORT")
SCP_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -P "$SSH_PORT")

remote() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }
remote_stdin() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

# --- subcommands -------------------------------------------------------------

cmd_install() {
  read -rp "tomomai base URL (e.g. https://tomomai.lol): " raw_url
  [ -z "$raw_url" ] && die "base URL required"

  # If the user pasted a Vercel Generate-Link URL straight into this
  # prompt (e.g. https://preview.tomomai.lol?_vercel_share=AbC123…), we
  # can peel the token out and skip the bypass prompt entirely. The
  # cleanup below removes the param and any trailing/stranded `?`/`&`.
  VERCEL_BYPASS_TOKEN=""
  if [[ "$raw_url" == *_vercel_share=* ]]; then
    VERCEL_BYPASS_TOKEN="${raw_url##*_vercel_share=}"
    VERCEL_BYPASS_TOKEN="${VERCEL_BYPASS_TOKEN%%[&#]*}"
    BASE_URL=$(printf '%s' "$raw_url" \
      | sed -E -e 's/[?&]_vercel_share=[^&#]*//' \
              -e 's/\?&/?/' -e 's/\?$//' -e 's/&$//')
    echo "    detected share token in URL (len=${#VERCEL_BYPASS_TOKEN})"
  else
    BASE_URL="$raw_url"
  fi
  BASE_URL="${BASE_URL%/}"
  RESULT_URL="$BASE_URL/cn-proxy/result"
  WEBHOOK_URL="$BASE_URL/api/cn-proxy/callback"
  echo "    BASE_URL    = $BASE_URL"
  echo "    RESULT_URL  = $RESULT_URL"
  echo "    WEBHOOK_URL = $WEBHOOK_URL"

  # --- check whether the backend is publicly reachable ---------------------
  # If it 401s with a Vercel auth gate (preview deployments do this by
  # default) the proxy will silently consume OAuth codes and then fail to
  # forward them. We need a `_vercel_share` token in that case.
  command -v curl >/dev/null 2>&1 || die "curl is required (to probe \$BASE_URL)"

  # Probes BASE_URL. With a token, appends `?_vercel_share=<token>` and
  # follows redirects with a cookie jar — same shape as what the proxy
  # itself does, so a passing probe means the proxy will work too.
  # (Header-based bypass `x-vercel-protection-bypass` is a *different*
  # Vercel feature that uses a *different* secret; share-link tokens
  # don't work as headers and would falsely fail the verification step.)
  probe_base_url() {
    local token="${1:-}" probe_body cookie_jar code url hint=""
    probe_body=$(mktemp)
    cookie_jar=$(mktemp)
    url="$BASE_URL/"
    if [ -n "$token" ]; then
      url="$BASE_URL/?_vercel_share=$token"
    fi
    code=$(curl -sS -o "$probe_body" -w "%{http_code}" --max-time 10 \
      -L --max-redirs 5 -c "$cookie_jar" -b "$cookie_jar" \
      "$url" 2>/dev/null || echo "000")
    if grep -qiE 'vercel|authentication required|deployment.*protect' "$probe_body" 2>/dev/null; then
      hint="vercel"
    fi
    rm -f "$probe_body" "$cookie_jar"
    echo "${code}|${hint}"
  }

  # Fast-path: token came in via the URL paste. Verify it without
  # bothering the user; only fall back to the interactive prompt if it
  # doesn't pan out (e.g. share link expired since they copied it).
  skip_bare_probe=""
  if [ -n "$VERCEL_BYPASS_TOKEN" ]; then
    echo "==> verifying pasted share token against $BASE_URL/ ..."
    probe_result=$(probe_base_url "$VERCEL_BYPASS_TOKEN")
    status="${probe_result%%|*}"
    if [[ "$status" =~ ^(2..|3..)$ ]]; then
      echo "    bypass works ($status) — using pasted token, skipping prompt."
      skip_bare_probe=1
    else
      echo "    pasted token didn't work (got $status) — falling back to interactive."
      VERCEL_BYPASS_TOKEN=""
    fi
  fi

  if [ -z "$skip_bare_probe" ]; then
    echo "==> probing $BASE_URL/ ..."
    probe_result=$(probe_base_url "")
    status="${probe_result%%|*}"
    hint="${probe_result##*|}"
    case "$status" in
    2*|3*)
      echo "    accessible ($status) — no bypass needed"
      ;;
    401|403)
      if [ "$hint" = "vercel" ]; then
        echo "    got $status with a Vercel auth gate body — preview is protected."
      else
        echo "    got $status — backend is gated. Assuming Vercel deployment protection."
      fi
      echo
      echo "    Open Vercel → Deployment → \"Share\" → \"Generate Link\","
      echo "    then paste the URL or just the _vercel_share token here."
      echo "    Example: https://preview.tomomai.lol?_vercel_share=AbCdEfGhIj123…"
      echo
      echo "    (or type 'skip' / hit ENTER to deploy without bypass — useful"
      echo "    for testing the proxy itself; the webhook will 401 at runtime.)"
      while true; do
        read -rp "    bypass link or raw token: " bypass_input
        case "$bypass_input" in
          ""|skip|SKIP)
            echo "    skipping bypass — proxy will be deployed without a Vercel token."
            VERCEL_BYPASS_TOKEN=""
            break
            ;;
        esac
        # Accept either a full share URL or the bare token.
        if [[ "$bypass_input" == *_vercel_share=* ]]; then
          VERCEL_BYPASS_TOKEN="${bypass_input##*_vercel_share=}"
          VERCEL_BYPASS_TOKEN="${VERCEL_BYPASS_TOKEN%%[&#]*}"
        else
          VERCEL_BYPASS_TOKEN="$bypass_input"
        fi
        if [ -z "$VERCEL_BYPASS_TOKEN" ]; then
          echo "    couldn't parse a token from input — try again, or 'skip' to bypass this prompt."
          continue
        fi

        echo "    re-probing with bypass token (len=${#VERCEL_BYPASS_TOKEN})..."
        probe_result=$(probe_base_url "$VERCEL_BYPASS_TOKEN")
        status2="${probe_result%%|*}"
        if [[ "$status2" =~ ^(2..|3..)$ ]]; then
          echo "    bypass works ($status2)"
          break
        else
          echo "    bypass token didn't work (got $status2). re-paste, or 'skip' to bypass."
          # don't reset token — let the loop re-read; user may paste again
          VERCEL_BYPASS_TOKEN=""
        fi
      done
      ;;
    000)
      echo "    couldn't reach $BASE_URL (DNS/TLS/timeout). proceeding anyway —"
      echo "    deploy will succeed but the proxy will log webhook errors at runtime."
      ;;
    *)
      echo "    unexpected status $status — proceeding anyway. webhook may not work."
      ;;
    esac
  fi

  read -rp "PROXY_PORT [2560]: " PROXY_PORT
  PROXY_PORT="${PROXY_PORT:-2560}"
  read -rp "target arch [amd64] (use arm64 for ARM VPS): " ARCH
  ARCH="${ARCH:-amd64}"

  command -v go >/dev/null 2>&1 \
    || die "go is required locally to cross-compile. install from https://go.dev/dl/"

  echo "==> cross-compiling for linux/$ARCH"
  GOOS=linux GOARCH="$ARCH" CGO_ENABLED=0 \
    go build -ldflags="-s -w" -o cn-proxy .
  ls -lh cn-proxy

  echo "==> opening ssh session (you'll be asked for the password once)"
  remote true

  echo "==> preparing $REMOTE_DIR"
  remote "sudo mkdir -p $REMOTE_DIR && sudo chown \$USER $REMOTE_DIR"

  echo "==> uploading binary (~$(du -h cn-proxy | cut -f1))"
  scp "${SCP_OPTS[@]}" cn-proxy "$SSH_TARGET:$REMOTE_DIR/cn-proxy.new"

  echo "==> installing systemd unit + firewall rule + restart"
  remote_stdin \
    "PROXY_PORT='$PROXY_PORT' RESULT_URL='$RESULT_URL' WEBHOOK_URL='$WEBHOOK_URL' \
     VERCEL_BYPASS_TOKEN='$VERCEL_BYPASS_TOKEN' \
     REMOTE_DIR='$REMOTE_DIR' UNIT='$UNIT' UNIT_FILE='$UNIT_FILE' bash -s" <<'REMOTE'
set -euo pipefail

if systemctl list-unit-files | grep -q "^${UNIT}\.service"; then
  sudo systemctl stop "$UNIT" || true
fi

chmod +x "$REMOTE_DIR/cn-proxy.new"
mv "$REMOTE_DIR/cn-proxy.new" "$REMOTE_DIR/cn-proxy"

# Only emit the bypass-token Environment= line if a token was supplied.
# (systemd treats empty Environment= values as the literal empty string,
# which would mask any future env override.)
BYPASS_LINE=""
if [ -n "${VERCEL_BYPASS_TOKEN:-}" ]; then
  BYPASS_LINE="Environment=VERCEL_BYPASS_TOKEN=${VERCEL_BYPASS_TOKEN}"
fi

sudo tee "$UNIT_FILE" >/dev/null <<EOF
[Unit]
Description=tomomai cn-proxy
After=network.target

[Service]
WorkingDirectory=${REMOTE_DIR}
Environment=PROXY_PORT=${PROXY_PORT}
Environment=RESULT_URL=${RESULT_URL}
Environment=WEBHOOK_URL=${WEBHOOK_URL}
${BYPASS_LINE}
ExecStart=${REMOTE_DIR}/cn-proxy
Restart=always
RestartSec=2
DynamicUser=yes
StandardOutput=journal
StandardError=journal
MemoryMax=64M

# Sandboxing — proxy is stateless, doesn't need any of this.
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$UNIT"
sudo systemctl restart "$UNIT"

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow "${PROXY_PORT}/tcp" >/dev/null
fi

sleep 1
sudo systemctl --no-pager --lines=15 status "$UNIT" || true
REMOTE

  echo
  echo "==> done."
  echo "    ./deploy.sh logs   $SSH_TARGET:$SSH_PORT   # tail journal"
  echo "    ./deploy.sh status $SSH_TARGET:$SSH_PORT   # systemd status"
  echo "==> remember to open TCP $PROXY_PORT in your cloud provider's security group."
}

cmd_status() {
  remote "sudo systemctl --no-pager --lines=20 status $UNIT || true"
}

cmd_logs() {
  echo "==> tailing journalctl -u $UNIT -f (ctrl-c to stop)"
  # -t allocates a TTY so ctrl-c cleanly stops the remote tail.
  ssh -t "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo journalctl -u $UNIT -f"
}

cmd_remove() {
  read -rp "remove $UNIT from $SSH_TARGET? [y/N]: " ANS
  case "$ANS" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac

  remote_stdin "UNIT='$UNIT' UNIT_FILE='$UNIT_FILE' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE'
set -euo pipefail

# Try to read PROXY_PORT off the unit before nuking it, so we can close ufw.
PROXY_PORT="$(awk -F= '/^Environment=PROXY_PORT=/{print $3}' "$UNIT_FILE" 2>/dev/null || true)"

if systemctl list-unit-files | grep -q "^${UNIT}\.service"; then
  sudo systemctl stop "$UNIT" || true
  sudo systemctl disable "$UNIT" || true
fi

sudo rm -f "$UNIT_FILE"
sudo systemctl daemon-reload
sudo systemctl reset-failed "$UNIT" 2>/dev/null || true

sudo rm -rf "$REMOTE_DIR"

if [ -n "${PROXY_PORT:-}" ] && command -v ufw >/dev/null 2>&1 \
  && sudo ufw status | grep -q "Status: active"; then
  sudo ufw delete allow "${PROXY_PORT}/tcp" >/dev/null 2>&1 || true
fi

echo "removed $UNIT, $UNIT_FILE, $REMOTE_DIR${PROXY_PORT:+ and ufw rule for ${PROXY_PORT}/tcp}"
REMOTE
}

case "$CMD" in
  install|update) cmd_install ;;
  status)         cmd_status ;;
  logs)           cmd_logs ;;
  remove)         cmd_remove ;;
esac
