# Webhook replay — missed CN update (2026/06/09)

The CN `update_all` run on 2026/06/09 17:02 GMT applied **+110 / ~126 / -22**
but the Discord notification never arrived. Root causes (see below) are being
fixed separately; this folder is the one-off recovery to post the missed
message.

## Files
- `cn-update-2026-06-09.response.json` — the raw `update_all` response captured
  from the Cronicle job log (source of truth for the replay).
- `replay-update-webhook.cjs` — verbatim port of `sendDiscordWebhook` that
  rebuilds the exact embed from the response and (optionally) POSTs it.
- `cn-missed-payload.json` — the ready-to-send embed, trimmed to Discord's
  4096-char limit (4096/4096).

## Send it
From any host/session with `discord.com` egress (the Full network policy):

```bash
# Option 1 — POST the prebuilt payload
curl -X POST -H "Content-Type: application/json" \
  --data @cn-missed-payload.json "$WEBHOOK_URL"

# Option 2 — rebuild + send via the script
WEBHOOK_URL=... node replay-update-webhook.cjs cn-update-2026-06-09.response.json cn --trim --send
```

`$WEBHOOK_URL` = the `DISCORD_UPDATE_WEBHOOK_CN` value. A `204 No Content`
means it posted. Drop `--send` for a dry run that just prints the payload.

## Why it failed (to be fixed in app code)
1. `apps/main/src/app/api/admin/upload/route.ts:543` fires `sendDiscordWebhook`
   fire-and-forget (no `after()`/`waitUntil`); on Vercel the function froze
   after responding, before the fetch completed — and no error was logged.
2. The CN embed description was **4779 chars**, over Discord's **4096** limit,
   so it would have been rejected (HTTP 400) even if sent. `sendDiscordWebhook`
   never caps the description (unlike `sendDiscordNotice`).
