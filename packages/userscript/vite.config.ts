import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const PLACEHOLDER = "__TOMOMAI_API_BASE__";
const CLIENT_ID_PLACEHOLDER = "__TOMOMAI_USERSCRIPT_CLIENT_ID__";
// The serving route also fills in the site's host for @connect and match patterns for every site's pages.
const HOST_PLACEHOLDER = "__TOMOMAI_API_HOST__";
const MATCH_PLACEHOLDER = "__TOMOMAI_SITE_MATCH__";
// The game of the site serving the script, and its brand icon.
const GAME_PLACEHOLDER = "__TOMOMAI_GAME__";
const ICON_PLACEHOLDER = "__TOMOMAI_ICON__";

// Userscript managers compare @version numerically to push auto-updates, so it must only grow. It is
// the HEAD commit's UTC time as YYYY.MMDD.HHMM, or the build's where there is no git history, as on
// some deploy builders.
const version = (() => {
  try {
    // In UTC like the fallback, so a builder with git and one without agree.
    return execSync("git show -s --format=%cd --date=format-local:%Y.%m%d.%H%M HEAD", {
      env: { ...process.env, TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
  } catch {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}.${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  }
})();

export default defineConfig({
  define: {
    // Both replaced at serve-time by the Next.js route. __API_BASE__ uses
    // resolveBaseUrl(); __USERSCRIPT_CLIENT_ID__ uses process.env.USERSCRIPT_CLIENT_ID.
    __API_BASE__: JSON.stringify(PLACEHOLDER),
    __USERSCRIPT_CLIENT_ID__: JSON.stringify(CLIENT_ID_PLACEHOLDER),
    __HOME_GAME__: JSON.stringify(GAME_PLACEHOLDER),
  },
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "tomomai",
        namespace: "https://tomomai.lol",
        version,
        description: "Sends your maimai DX NET or CHUNITHM-NET International login cookie to tomomai or tomochu",
        icon: ICON_PLACEHOLDER,
        match: [
          "https://lng-tgk-aime-gw.am-all.net/common_auth/*",
          // Only to send a player who just signed in back to the gateway.
          "https://maimaidx-eng.com/maimai-mobile/*",
          "https://chunithm-net-eng.com/mobile/*",
          MATCH_PLACEHOLDER,
        ],
        noframes: true,
        grant: ["GM_cookie", "GM.cookie", "GM_getValue", "GM_setValue", "GM_xmlhttpRequest", "GM_info", "window.close"],
        connect: [HOST_PLACEHOLDER],
        updateURL: `${PLACEHOLDER}/userscript.user.js`,
        downloadURL: `${PLACEHOLDER}/userscript.user.js`,
        // document-start so a player on their way back leaves the DX NET page before it renders.
        "run-at": "document-start",
      },
    }),
  ],
});
