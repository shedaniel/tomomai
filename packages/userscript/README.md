# @tomomai/userscript

A userscript that sends a player's maimai DX NET International login cookie to tomomai, so they can
fetch scores without typing a password or copying the cookie by hand.

SEGA's gateway sets the `clal` cookie as HttpOnly, so page scripts and bookmarklets cannot read it.
A userscript manager can, through `GM_cookie`, once its HttpOnly cookie setting is on. The token
dialog's userscript guide walks players through that setting for each manager.

## What it does

- **On the SEGA gateway's landing page** (`https://lng-tgk-aime-gw.am-all.net/common_auth/`, which
  says Not Found) it shows a panel over the page that reads `clal` and, on a click, saves it with
  `PUT /api/v1/games/maimai/fetch/token?region=intl`.
- **When there is no cookie yet**, the panel opens SEGA's sign-in form, tagged with `tomomai=signin`.
  The script shows a small hint there, reminding players to keep auto login ticked, since `clal` is
  SEGA's auto login cookie. SEGA sends a signed-in player to DX NET, so on
  `https://maimaidx-eng.com/maimai-mobile/*` the script sends them straight back to the landing page,
  only within 30 minutes of that tagged sign-in. It runs at `document-start` so DX NET never renders.
- **On tomomai's own pages** it only sets `data-tomomai-userscript` on `<html>` and fires a
  `tomomai:userscript` event, so the token dialog knows it is installed and skips the setup steps.

The open token dialog polls for the saved token and starts the fetch itself, the same way a pasted
cookie does. After sending, the panel can close its tab (`@grant window.close`).

The bundle is plain TypeScript with no dependencies and no `@require`, so what players install is what
this package builds. The panel's logo is inlined from `src/assets`.

## Signing in to tomomai

The script is an OAuth **public client**: it holds no secret and signs in with PKCE.

1. A click on the panel opens `/api/auth/oauth2/authorize` in a popup, asking for
   `offline_access fetch:token:write`.
2. Better Auth returns the popup to [`/userscript/callback`](../../apps/main/src/app/userscript/callback/route.ts),
   which posts `{ code, state }` to the opener on the gateway origin only and closes.
3. The script checks the message's origin and `state`, then exchanges the code at
   `/api/auth/oauth2/token` with `client_id` and its `code_verifier`, through `GM_xmlhttpRequest`
   without cookies, so CORS and tomomai's session cookie are out of the way.
4. Tokens are kept in the manager's storage. Refresh tokens rotate on every use, and a failed
   refresh asks the player to sign in again.

## Serving

The bundle is built once and served by [`/userscript.user.js`](../../apps/main/src/app/userscript.user.js/route.ts),
which fills in placeholders on every request, so one build works on every deployment:

| Placeholder                        | Filled with                                          |
| ---------------------------------- | ---------------------------------------------------- |
| `__TOMOMAI_API_BASE__`             | The site's base URL                                  |
| `__TOMOMAI_USERSCRIPT_CLIENT_ID__` | `USERSCRIPT_CLIENT_ID`                               |
| `__TOMOMAI_API_HOST__`             | The site's host name, for `@connect`                 |
| `__TOMOMAI_SITE_MATCH__`           | A match pattern for the site's pages, for `@match`   |

The route, the callback and the dialog's userscript option are all behind the `userscriptFetch` flag.

## Setup

1. Sign in as an admin and open **Settings > Developer**. Create an OAuth app with **Browser script**
   switched on, the redirect URI `https://<site>/userscript/callback` and the scope
   **Save game tokens** (`fetch:token:write`). A development server may use
   `http://localhost:3000/userscript/callback`. Set the icon to `https://<site>/brand/maimai/icon.png`
   so the consent screen shows the tomomai mascot instead of a letter. No secret is issued.
2. Set `USERSCRIPT_CLIENT_ID` to its client ID and restart the server.
3. Build the bundle:

   ```sh
   pnpm --filter @tomomai/userscript build
   ```

   The route reads `dist/@tomomai/userscript.user.js` on each request, so rebuild only when the
   script's source changes. `build --watch` works for iterating.
4. Turn on `userscriptFetch`, open `/userscript.user.js` and install it.

## Troubleshooting

**`invalid_redirect` on sign-in.** The app's redirect URI must be exactly `<site>/userscript/callback`,
scheme, host, port and path included.

**The panel says there is no login cookie while you are signed in.** The manager is not letting
scripts read HttpOnly cookies. Tampermonkey needs Config mode Advanced and "Allow scripts to access
cookies" set to All. Violentmonkey needs both "Allow GM_cookie to access HTTP-only cookies" boxes.
ScriptCat asks on first use.

**`USERSCRIPT_CLIENT_ID is not set on the server`.** Set it, see step 2.
