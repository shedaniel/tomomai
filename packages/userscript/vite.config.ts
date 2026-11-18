import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const PLACEHOLDER = "__TOMOMAI_API_BASE__";
const CLIENT_ID_PLACEHOLDER = "__TOMOMAI_USERSCRIPT_CLIENT_ID__";
// The serving route also fills in the site's host for @connect and a match pattern for its pages.
const HOST_PLACEHOLDER = "__TOMOMAI_API_HOST__";
const MATCH_PLACEHOLDER = "__TOMOMAI_SITE_MATCH__";

// Userscript managers compare @version numerically to push auto-updates, so it
// must increase monotonically. Use the HEAD commit datetime directly
// (YYYY.MMDD.HHMM) — purely date-driven, always monotonic, auto-bumps per build.
const version = (() => {
  try {
    return execSync("git show -s --format=%cd --date=format:%Y.%m%d.%H%M HEAD").toString().trim();
  } catch {
    return "0.0.0";
  }
})();

export default defineConfig({
  define: {
    // Both replaced at serve-time by the Next.js route. __API_BASE__ uses
    // resolveBaseUrl(); __USERSCRIPT_CLIENT_ID__ uses process.env.USERSCRIPT_CLIENT_ID.
    __API_BASE__: JSON.stringify(PLACEHOLDER),
    __USERSCRIPT_CLIENT_ID__: JSON.stringify(CLIENT_ID_PLACEHOLDER),
  },
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "tomomai",
        namespace: "https://tomomai.lol",
        version,
        description: "Sends your maimai DX NET International login cookie to tomomai",
        icon: `${PLACEHOLDER}/brand/maimai/icon.png`,
        match: [
          "https://lng-tgk-aime-gw.am-all.net/common_auth/*",
          // Only to send a player who just signed in back to the gateway.
          "https://maimaidx-eng.com/maimai-mobile/*",
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
