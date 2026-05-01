#!/usr/bin/env bash
# tomomai cn CLI — manage the Caddy reverse-proxy on a remote Ubuntu host over SSH.
#
# Usage:
#   ./deploy.sh install       [user@host[:port]]   install Caddy + render Caddyfile + start
#   ./deploy.sh update-config [user@host[:port]]   re-render Caddyfile only (no Caddy reinstall)
#   ./deploy.sh status        [user@host[:port]]   systemctl status caddy
#   ./deploy.sh logs          [user@host[:port]]   tail journalctl -u caddy -f
#   ./deploy.sh remove        [user@host[:port]]   stop + uninstall Caddy + remove Caddyfile + ufw rules
#   ./deploy.sh check         [host]               probe the public proxy (no SSH)
#   ./deploy.sh help                                this message
#
# `install` is idempotent — re-run to update. Caddy is installed from the
# official Cloudsmith apt repo, then rebuilt with the Souin cache module via
# xcaddy (one-time bootstrap; skipped if already present). Configuration is
# rendered from Caddyfile.tmpl using values prompted at install time.

set -euo pipefail

cd "$(dirname "$0")"

UNIT="caddy"
UNIT_FILE="/etc/systemd/system/multi-user.target.wants/caddy.service"  # informational
CADDYFILE="/etc/caddy/Caddyfile"
TMPL="Caddyfile.tmpl"

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

die() { echo "error: $*" >&2; exit 1; }

# --- parse subcommand --------------------------------------------------------

CMD="${1:-}"
[ -z "$CMD" ] && { usage; exit 1; }
shift || true

case "$CMD" in
  help|-h|--help) usage; exit 0 ;;
  install|update|update-config|status|logs|remove|check) ;;
  *) die "unknown command: $CMD (try: ./deploy.sh help)" ;;
esac

# `check` doesn't talk to the host over SSH — it probes the public proxy.
if [ "$CMD" = "check" ]; then
  cmd_check_dispatch() {
    local host="${1:-}"
    if [ -z "$host" ]; then
      read -rp "proxy domain (e.g. cn.tomomai.lol): " host
    fi
    [ -z "$host" ] && die "proxy domain required"

    command -v curl >/dev/null 2>&1 || die "curl is required for ./deploy.sh check"

    # Resolve A/AAAA so the operator can spot a stale CF-orange-cloud answer
    # (CF anycast IPs vs. their actual HK box IP).
    local resolved=""
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

    if [ -n "$resolved" ]; then
      echo "==> probing tomomai cn at https://${host}  (-> ${resolved})"
    else
      echo "==> probing tomomai cn at https://${host}"
    fi
    echo

    local fail=0
    local total_start
    total_start=$(date +%s.%N 2>/dev/null || date +%s)

    # Echoes "<http_code> <time_total>". On connection failure curl prints
    # "000" via -w, so we just swallow non-zero exits.
    probe_status() {
      curl -sS -o /dev/null -w "%{http_code} %{time_total}" \
        --connect-timeout 5 --max-time 12 "$@" 2>/dev/null || true
    }

    # Echoes the X-Cn-Cache header value (HIT/MISS/STALE/...) plus status.
    probe_cache() {
      curl -sS -D - -o /dev/null --connect-timeout 5 --max-time 12 "$@" 2>/dev/null \
        | awk 'BEGIN{IGNORECASE=1} /^x-cn-cache:/{print $2; exit}' \
        | tr -d '\r\n'
    }

    diagnose() {
      echo "    ---- diagnostic (curl -v) ----"
      curl -sS -v --connect-timeout 5 --max-time 12 "$@" -o /dev/null 2>&1 \
        | sed -E 's/^/    /' \
        | head -50
      echo "    ------------------------------"
    }

    check() {
      local label="$1" expect_re="$2"; shift 2
      local raw status elapsed
      raw=$(probe_status "$@")
      status="${raw%% *}"
      elapsed="${raw#* }"
      [ "$raw" = "" ] && { status="000"; elapsed="0"; }
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

    # 1. TLS + reachability + upstream proxying. /api/v1/ok is the canonical
    #    health endpoint and doesn't require auth.
    check "[1/5] https GET /api/v1/ok               " '^200$' \
      "https://${host}/api/v1/ok"

    # 2. Wrong-Host defence: if anyone hits our IP with a different SNI/Host,
    #    Caddy should refuse with 421 (or 404 if the Host doesn't match any
    #    site at all). 404 is also acceptable.
    check "[2/5] https reject misdirected host      " '^(421|404|000)$' \
      -H "Host: example.com" "https://${host}/"

    # 3. HTTP/3 (QUIC). UDP/443 must be open in the cloud security group +
    #    ufw. CN clients on lossy mobile links benefit a lot from this.
    if curl --help all 2>/dev/null | grep -q -- '--http3'; then
      check "[3/5] http/3 GET /api/v1/ok              " '^200$' \
        --http3 "https://${host}/api/v1/ok"
    else
      printf "  %-46s skip (curl built without --http3)\n" "[3/5] http/3 GET /api/v1/ok              "
    fi

    # 4. Edge-cache MISS on first hit to a Next.js static asset. We discover
    #    a real hashed path by parsing the homepage's HTML — fragile but
    #    avoids hardcoding hashes that change every deploy.
    local static_path
    static_path=$(curl -sS --max-time 10 "https://${host}/" 2>/dev/null \
      | grep -oE '/_next/static/[^"'"'"' ]+\.(js|css)' \
      | head -1 || true)
    if [ -n "$static_path" ]; then
      # Warm the cache (don't care about result), then check HIT on second hit.
      curl -sS -o /dev/null --max-time 10 "https://${host}${static_path}" 2>/dev/null || true
      sleep 0.5
      local cache_status
      cache_status=$(probe_cache "https://${host}${static_path}")
      printf "  %-46s " "[4/5] edge cache hit on _next/static    "
      if [[ "$cache_status" == hit* || "$cache_status" == HIT* ]]; then
        printf "ok   (X-Cn-Cache: %s)\n" "$cache_status"
      else
        printf "FAIL (X-Cn-Cache: %s, want HIT)\n" "${cache_status:-<missing>}"
        fail=$((fail+1))
      fi
    else
      printf "  %-46s skip (couldn't find _next/static URL on /)\n" "[4/5] edge cache hit on _next/static    "
    fi

    # 5. TLS cert sanity — the cert presented should be for $host (catches
    #    the case where DNS still points at CF or a stale IP).
    local cert_cn
    cert_cn=$(curl -sS --max-time 8 -v "https://${host}/" 2>&1 \
      | awk -F'CN=' '/subject:.*CN=/{print $2; exit}' \
      | sed 's/[;,].*//' | tr -d ' \r\n' || true)
    printf "  %-46s " "[5/5] tls cert CN matches host          "
    if [ -n "$cert_cn" ] && [[ "$cert_cn" == "$host" || "$cert_cn" == "*."* ]]; then
      printf "ok   (CN=%s)\n" "$cert_cn"
    else
      printf "FAIL (CN=%s)\n" "${cert_cn:-<unknown>}"
      fail=$((fail+1))
    fi

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
trap 'ssh -O exit -o ControlPath="$CTRL_DIR/cm" -p "$SSH_PORT" "$SSH_TARGET" 2>/dev/null || true; rm -rf "$CTRL_DIR"; rm -f Caddyfile.rendered 2>/dev/null || true' EXIT

SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -p "$SSH_PORT")
SCP_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -P "$SSH_PORT")

remote() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }
remote_stdin() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

# --- helpers -----------------------------------------------------------------

# Renders Caddyfile.tmpl → Caddyfile.rendered using the env vars set by
# cmd_install / cmd_update_config. We use simple sed substitution rather
# than envsubst so the host doesn't need gettext-base installed and so
# template syntax (`{block}`) doesn't collide.
render_caddyfile() {
  [ -f "$TMPL" ] || die "$TMPL not found in $(pwd)"
  sed \
    -e "s|{{PROXY_DOMAIN}}|${PROXY_DOMAIN}|g" \
    -e "s|{{UPSTREAM}}|${UPSTREAM}|g" \
    -e "s|{{ACME_EMAIL}}|${ACME_EMAIL}|g" \
    -e "s|{{STATIC_TTL}}|${STATIC_TTL}|g" \
    -e "s|{{IMAGE_TTL}}|${IMAGE_TTL}|g" \
    "$TMPL" > Caddyfile.rendered
}

prompt_config() {
  read -rp "proxy domain (what users hit, e.g. cn.tomomai.lol): " PROXY_DOMAIN
  [ -z "$PROXY_DOMAIN" ] && die "proxy domain required"
  # The upstream hostname is what Caddy connects to AND what gets sent as
  # the Host header on upstream requests (Caddy default; we deliberately
  # don't override). For prod, prefer a Vercel-direct hostname like
  # tomomai-charts.vercel.app so traffic bypasses Cloudflare entirely
  # (fewer hops, lower latency from HK). For local dev with a cloudflared
  # tunnel (e.g. dev.tomomai.lol), use that — it'll still flow through CF,
  # but CF will route it correctly because the Host matches a hostname it
  # manages.
  #
  # The app reads X-Forwarded-Host (auto-set to {{PROXY_DOMAIN}}) for
  # canonical URLs and OAuth redirect_uri, so the upstream Host doesn't
  # need to match {{PROXY_DOMAIN}}.
  read -rp "upstream domain (e.g. tomomai-charts.vercel.app for prod, dev.tomomai.lol for cloudflared tunnel): " UPSTREAM
  [ -z "$UPSTREAM" ] && die "upstream domain required"
  read -rp "ACME email (for Let's Encrypt): " ACME_EMAIL
  [ -z "$ACME_EMAIL" ] && die "ACME email required"
  read -rp "static cache TTL [720h]: " STATIC_TTL
  STATIC_TTL="${STATIC_TTL:-720h}"
  read -rp "image cache TTL [24h]: " IMAGE_TTL
  IMAGE_TTL="${IMAGE_TTL:-24h}"

  # Sanity: warn if PROXY_DOMAIN doesn't already resolve to this box. ACME
  # HTTP-01 will fail otherwise. We can't tell the user's public IP from
  # here cheaply, so just check that *something* resolves (catches typos).
  if command -v getent >/dev/null 2>&1; then
    if ! getent ahosts "$PROXY_DOMAIN" >/dev/null 2>&1; then
      echo "warn: $PROXY_DOMAIN doesn't resolve. add an A record (gray-cloud)"
      echo "      pointing at this server's public IP before continuing, or"
      echo "      ACME HTTP-01 will fail and Caddy won't get a cert."
      read -rp "continue anyway? [y/N]: " ans
      case "$ans" in y|Y|yes|YES) ;; *) die "aborted by user" ;; esac
    fi
  fi
}

# --- subcommands -------------------------------------------------------------

cmd_install() {
  prompt_config

  echo "    PROXY_DOMAIN = $PROXY_DOMAIN"
  echo "    UPSTREAM     = $UPSTREAM"
  echo "    ACME_EMAIL   = $ACME_EMAIL"
  echo "    STATIC_TTL   = $STATIC_TTL"
  echo "    IMAGE_TTL    = $IMAGE_TTL"

  echo "==> rendering $TMPL → Caddyfile.rendered"
  render_caddyfile

  echo "==> opening ssh session"
  remote true

  echo "==> installing/upgrading Caddy + Souin cache module on remote"
  remote_stdin "PROXY_DOMAIN='$PROXY_DOMAIN' bash -s" <<'REMOTE'
set -euo pipefail

# 1. Install official Caddy if missing -----------------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  echo "--> installing caddy from cloudsmith apt repo"
  sudo apt-get update -qq
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
else
  echo "--> caddy already installed: $(caddy version | head -1)"
fi

# 2. Build Caddy with Souin cache module, if not already present ---------------
# `caddy list-modules` will include `cache` (Souin) once we've rebuilt.
if ! caddy list-modules 2>/dev/null | grep -q '^cache$'; then
  echo "--> rebuilding caddy with github.com/caddyserver/cache-handler"

  # Install Go (needed by xcaddy). Use the distro package; xcaddy doesn't
  # need a bleeding-edge Go for the cache-handler module.
  if ! command -v go >/dev/null 2>&1; then
    sudo apt-get install -y -qq golang-go
  fi

  # Install xcaddy. It ships in a *separate* Cloudsmith repo from caddy
  # itself (`caddy/xcaddy`, not `caddy/stable`), so we add it on demand.
  # Fall back to `go install` if apt fails (e.g. unsupported distro).
  if ! command -v xcaddy >/dev/null 2>&1; then
    if [ ! -f /usr/share/keyrings/caddy-xcaddy-archive-keyring.gpg ]; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/gpg.key' \
        | sudo gpg --dearmor -o /usr/share/keyrings/caddy-xcaddy-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/debian.deb.txt' \
        | sudo tee /etc/apt/sources.list.d/caddy-xcaddy.list >/dev/null
      sudo apt-get update -qq
    fi
    if ! sudo apt-get install -y -qq xcaddy; then
      echo "--> apt install xcaddy failed; falling back to 'go install'"
      go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
      # Make xcaddy reachable via PATH for the build step below.
      export PATH="$PATH:$HOME/go/bin:/root/go/bin"
      command -v xcaddy >/dev/null 2>&1 \
        || { echo "error: xcaddy not on PATH after go install" >&2; exit 1; }
    fi
  fi

  TMP=$(mktemp -d)
  pushd "$TMP" >/dev/null
  xcaddy build --with github.com/caddyserver/cache-handler
  sudo systemctl stop caddy || true
  sudo mv ./caddy /usr/bin/caddy
  sudo setcap cap_net_bind_service=+ep /usr/bin/caddy
  popd >/dev/null
  rm -rf "$TMP"

  echo "--> caddy rebuilt: $(caddy version | head -1)"
  caddy list-modules 2>/dev/null | grep -q '^cache$' \
    || { echo "error: cache module still missing after rebuild" >&2; exit 1; }
fi

# 3. Make sure Caddy data dirs exist + log dir is writable --------------------
# The Caddy systemd unit runs as user `caddy` (created by the apt package).
# We use a custom log file in /var/log/caddy/<domain>.log, so the unit's
# default sandboxing (ProtectSystem, ReadWritePaths) needs to permit
# writes there. The apt unit ships with `/var/log/caddy` already on its
# ReadWritePaths, but the directory itself isn't created by the package
# until first start — so we create it eagerly with the right owner.
sudo mkdir -p /etc/caddy /var/log/caddy
if id -u caddy >/dev/null 2>&1; then
  sudo chown -R caddy:caddy /var/log/caddy
  sudo chmod 0755 /var/log/caddy
else
  echo "warn: 'caddy' user not found — apt install may have used a different user." >&2
  echo "      check /usr/lib/systemd/system/caddy.service for the User= directive." >&2
fi
REMOTE

  echo "==> uploading rendered Caddyfile"
  scp "${SCP_OPTS[@]}" Caddyfile.rendered "$SSH_TARGET:/tmp/Caddyfile.new"

  echo "==> validating + installing Caddyfile + reloading"
  remote_stdin "CADDYFILE='$CADDYFILE' bash -s" <<'REMOTE'
set -euo pipefail

# Validate before swapping in the new config. If validation fails, leave
# the old Caddyfile untouched so the running proxy keeps serving.
if ! sudo caddy validate --config /tmp/Caddyfile.new --adapter caddyfile; then
  echo "error: Caddyfile validation failed; not swapping" >&2
  rm -f /tmp/Caddyfile.new
  exit 1
fi

sudo mv /tmp/Caddyfile.new "$CADDYFILE"
sudo chown root:caddy "$CADDYFILE" 2>/dev/null || true
sudo chmod 0644 "$CADDYFILE"

sudo systemctl enable caddy >/dev/null 2>&1 || true

# Reload if running, else start. `reload` is graceful (no dropped conns).
if systemctl is-active --quiet caddy; then
  sudo systemctl reload caddy
else
  sudo systemctl start caddy
fi

# Open firewall: 80/tcp (ACME HTTP-01), 443/tcp (HTTP/1.1+2), 443/udp (HTTP/3).
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp  >/dev/null
  sudo ufw allow 443/tcp >/dev/null
  sudo ufw allow 443/udp >/dev/null
fi

sleep 1
sudo systemctl --no-pager --lines=15 status caddy || true
REMOTE

  echo
  echo "==> done."
  echo "    ./deploy.sh logs   $SSH_TARGET:$SSH_PORT   # tail journal"
  echo "    ./deploy.sh status $SSH_TARGET:$SSH_PORT   # systemd status"
  echo "    ./deploy.sh check  $PROXY_DOMAIN          # probe public proxy (no SSH)"
  echo
  echo "==> next steps:"
  echo "    1. DNS: A record $PROXY_DOMAIN → this server's public IP, gray-cloud (DNS only)."
  echo "    2. Vercel: add $PROXY_DOMAIN as a domain on your project."
  echo "    3. App env: set TRUSTED_ORIGINS and AUTH_COOKIE_DOMAIN (see cn/README.md)."
  echo "    4. Cloud security group: open TCP 80, TCP 443, UDP 443."
}

cmd_update_config() {
  prompt_config
  echo "==> rendering $TMPL → Caddyfile.rendered"
  render_caddyfile

  echo "==> uploading + reloading"
  scp "${SCP_OPTS[@]}" Caddyfile.rendered "$SSH_TARGET:/tmp/Caddyfile.new"
  remote_stdin "CADDYFILE='$CADDYFILE' bash -s" <<'REMOTE'
set -euo pipefail
sudo caddy validate --config /tmp/Caddyfile.new --adapter caddyfile
sudo mv /tmp/Caddyfile.new "$CADDYFILE"
sudo chown root:caddy "$CADDYFILE" 2>/dev/null || true
sudo chmod 0644 "$CADDYFILE"
sudo systemctl enable caddy >/dev/null 2>&1 || true
# `reload` graceful-restarts running Caddy; if it's stopped (e.g. an
# earlier install failed validation and never came up), fall back to
# `start` so update-config doubles as a recovery path.
if systemctl is-active --quiet caddy; then
  sudo systemctl reload caddy
else
  sudo systemctl start caddy
fi
sudo systemctl --no-pager --lines=10 status caddy || true
REMOTE
  echo "==> done."
}

cmd_status() {
  remote "sudo systemctl --no-pager --lines=20 status $UNIT || true"
}

cmd_logs() {
  echo "==> tailing journalctl -u $UNIT -f (ctrl-c to stop)"
  ssh -t "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo journalctl -u $UNIT -f"
}

cmd_remove() {
  read -rp "remove caddy + Caddyfile from $SSH_TARGET? [y/N]: " ANS
  case "$ANS" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac

  remote_stdin "bash -s" <<'REMOTE'
set -euo pipefail

if systemctl list-unit-files | grep -q '^caddy\.service'; then
  sudo systemctl stop caddy || true
  sudo systemctl disable caddy || true
fi

# Caddy was installed via apt; remove the package so we don't leave a
# half-configured proxy on the box. This also removes the systemd unit.
if dpkg -l | awk '{print $2}' | grep -q '^caddy$'; then
  sudo apt-get purge -y -qq caddy || true
fi

sudo rm -rf /etc/caddy /var/log/caddy /var/lib/caddy

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw delete allow 443/udp >/dev/null 2>&1 || true
  # Leave 80/tcp + 443/tcp alone — the operator may need them for other
  # services. Surface this so they know.
  echo "note: left 80/tcp and 443/tcp ufw rules in place (other services may need them)."
fi

echo "removed caddy, /etc/caddy, /var/log/caddy, /var/lib/caddy"
REMOTE
}

case "$CMD" in
  install)              cmd_install ;;
  update|update-config) cmd_update_config ;;
  status)               cmd_status ;;
  logs)                 cmd_logs ;;
  remove)               cmd_remove ;;
esac
