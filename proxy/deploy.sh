#!/usr/bin/env bash
# Deploy tomomai cn-proxy (Go) to an Ubuntu host over SSH.
# Cross-compiles a static Linux binary locally and scps it — server needs no
# toolchain, no Node, no apt fetch. Idempotent: re-run to update + restart.
#
# Usage: ./deploy.sh                  (prompts interactively)
#        ./deploy.sh user@host

set -euo pipefail

cd "$(dirname "$0")"

SSH_TARGET="${1:-}"
if [ -z "$SSH_TARGET" ]; then
  read -rp "SSH target (user@host): " SSH_TARGET
fi
[ -z "$SSH_TARGET" ] && { echo "ssh target required"; exit 1; }

SSH_PORT=22
if [[ "$SSH_TARGET" == *:* ]]; then
  SSH_PORT="${SSH_TARGET##*:}"
  SSH_TARGET="${SSH_TARGET%:*}"
fi

read -rp "tomomai base URL (e.g. https://tomomai.lol): " BASE_URL
[ -z "$BASE_URL" ] && { echo "base URL required"; exit 1; }
BASE_URL="${BASE_URL%/}"
RESULT_URL="$BASE_URL/cn-proxy/result"
WEBHOOK_URL="$BASE_URL/api/cn-proxy/callback"
echo "    RESULT_URL  = $RESULT_URL"
echo "    WEBHOOK_URL = $WEBHOOK_URL"
read -rp "PROXY_PORT [2560]: " PROXY_PORT
PROXY_PORT="${PROXY_PORT:-2560}"
read -rp "target arch [amd64] (use arm64 for ARM VPS): " ARCH
ARCH="${ARCH:-amd64}"

if ! command -v go >/dev/null 2>&1; then
  echo "go is required locally to cross-compile. install from https://go.dev/dl/" >&2
  exit 1
fi

echo "==> cross-compiling for linux/$ARCH"
GOOS=linux GOARCH="$ARCH" CGO_ENABLED=0 \
  go build -ldflags="-s -w" -o cn-proxy ./...
ls -lh cn-proxy

CTRL_DIR="$(mktemp -d)"
trap 'ssh -O exit -o ControlPath="$CTRL_DIR/cm" -p "$SSH_PORT" "$SSH_TARGET" 2>/dev/null || true; rm -rf "$CTRL_DIR"' EXIT

SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -p "$SSH_PORT")
SCP_OPTS=(-o ControlMaster=auto -o ControlPath="$CTRL_DIR/cm" -o ControlPersist=60s -P "$SSH_PORT")

echo "==> opening ssh session (you'll be asked for the password once)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" true

echo "==> preparing /opt/tomomai-proxy"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo mkdir -p /opt/tomomai-proxy && sudo chown \$USER /opt/tomomai-proxy"

echo "==> uploading binary (~$(du -h cn-proxy | cut -f1))"
scp "${SCP_OPTS[@]}" cn-proxy "$SSH_TARGET:/opt/tomomai-proxy/cn-proxy.new"

echo "==> installing systemd unit + firewall rule + restart"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
  "PROXY_PORT='$PROXY_PORT' RESULT_URL='$RESULT_URL' WEBHOOK_URL='$WEBHOOK_URL' bash -s" <<'REMOTE'
set -euo pipefail

# Stop any prior Node-based unit so the apt unpack stops chewing the box.
if systemctl list-unit-files | grep -q '^tomomai-proxy\.service'; then
  sudo systemctl stop tomomai-proxy || true
fi

chmod +x /opt/tomomai-proxy/cn-proxy.new
mv /opt/tomomai-proxy/cn-proxy.new /opt/tomomai-proxy/cn-proxy

sudo tee /etc/systemd/system/tomomai-proxy.service >/dev/null <<EOF
[Unit]
Description=tomomai cn-proxy
After=network.target

[Service]
WorkingDirectory=/opt/tomomai-proxy
Environment=PROXY_PORT=${PROXY_PORT}
Environment=RESULT_URL=${RESULT_URL}
Environment=WEBHOOK_URL=${WEBHOOK_URL}
ExecStart=/opt/tomomai-proxy/cn-proxy
Restart=always
RestartSec=2
User=nobody
StandardOutput=journal
StandardError=journal
MemoryMax=64M

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tomomai-proxy
sudo systemctl restart tomomai-proxy

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow "${PROXY_PORT}/tcp" >/dev/null
fi

sleep 1
sudo systemctl --no-pager --lines=15 status tomomai-proxy || true
REMOTE

rm -f cn-proxy

echo
echo "==> done. tail logs with:"
echo "    ssh -p $SSH_PORT $SSH_TARGET 'sudo journalctl -u tomomai-proxy -f'"
echo "==> remember to open TCP $PROXY_PORT in your cloud provider's security group."
