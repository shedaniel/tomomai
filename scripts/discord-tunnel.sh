#!/usr/bin/env sh
# Opens a Cloudflare quick tunnel to the local dev server so Discord can deliver
# interactions to it. The URL changes on every run, so with DISCORD_BOT_TOKEN set
# the app's Interactions Endpoint URL is updated automatically.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

port=${PORT:-3000}
local_url="http://localhost:$port"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it with: brew install cloudflared" >&2
  exit 1
fi

status() { curl -s -o /dev/null -w '%{http_code}' -X POST "$@" || true; }

if [ "$(status "$local_url/api/interactions")" != "401" ]; then
  echo "warning: $local_url/api/interactions is not responding. Start the dev server with \`pnpm dev\`." >&2
fi

log=$(mktemp)
cloudflared tunnel --no-autoupdate --url "$local_url" >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; rm -f "$log"' EXIT
trap 'exit 130' INT TERM

url=""
tries=0
while [ -z "$url" ]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$log" >&2
    echo "cloudflared exited before the tunnel came up." >&2
    exit 1
  fi
  if [ "$tries" -ge 30 ]; then
    cat "$log" >&2
    echo "Timed out waiting for the tunnel URL." >&2
    exit 1
  fi
  sleep 1
  tries=$((tries + 1))
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -n 1 || true)
done

# Discord pings the endpoint when you save it, so wait until the tunnel routes.
# DoH sidesteps the system resolver caching the not-yet-existing hostname.
tries=0
while [ "$(status --doh-url https://1.1.1.1/dns-query "$url/api/interactions")" != "401" ] && [ "$tries" -lt 20 ]; do
  sleep 1
  tries=$((tries + 1))
done

if [ "$(status --doh-url https://1.1.1.1/dns-query "$url/api/interactions")" != "401" ]; then
  echo "warning: the tunnel is not reaching the interactions route yet." >&2
fi

endpoint="$url/api/interactions"
bot_token=${DISCORD_BOT_TOKEN:-$(sed -nE "s/^DISCORD_BOT_TOKEN=[\"']?([^\"']*)[\"']?\$/\\1/p" .env.local 2>/dev/null | tail -n 1)}

# Only replaces an empty or quick-tunnel endpoint unless FORCE=1.
set_endpoint() {
  BOT_TOKEN="$bot_token" ENDPOINT="$endpoint" FORCE="${FORCE:-}" node --input-type=module -e '
    const api = "https://discord.com/api/v10/applications/@me";
    const headers = { Authorization: `Bot ${process.env.BOT_TOKEN}`, "Content-Type": "application/json" };
    const current = await fetch(api, { headers });
    if (!current.ok) {
      console.error(`Could not read the Discord application (HTTP ${current.status}), check DISCORD_BOT_TOKEN.`);
      process.exit(1);
    }
    const { name, interactions_endpoint_url: previous } = await current.json();
    if (previous && !new URL(previous).hostname.endsWith(".trycloudflare.com")) {
      if (process.env.FORCE !== "1") {
        console.error(`"${name}" already points at ${previous}, leaving it alone. Rerun with FORCE=1 to replace it.`);
        process.exit(1);
      }
      console.log(`Replacing the previous endpoint ${previous}`);
    }
    const res = await fetch(api, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ interactions_endpoint_url: process.env.ENDPOINT }),
    });
    if (!res.ok) {
      console.error(`Discord rejected the endpoint (HTTP ${res.status}): ${await res.text()}`);
      console.error("DISCORD_PUBLIC_KEY in .env.local must match the app, and pnpm dev must be restarted after changing it.");
      process.exit(1);
    }
    console.log(`Set the Interactions Endpoint URL of "${name}" to:`);
  '
}

echo
if [ -n "$bot_token" ] && set_endpoint; then
  echo
  echo "  $endpoint"
else
  cat <<EOF
Interactions Endpoint URL:

  $endpoint

Paste it into Discord Developer Portal > your app > General Information >
Interactions Endpoint URL. DISCORD_PUBLIC_KEY in .env.local must match that app.
EOF
  if [ -z "$bot_token" ]; then
    echo "Set DISCORD_BOT_TOKEN in .env.local to update it automatically."
  fi
fi
echo
echo "Register slash commands with \`make discord-register\`."
echo
echo "Tunnel running, press Ctrl-C to stop."
wait "$pid"
