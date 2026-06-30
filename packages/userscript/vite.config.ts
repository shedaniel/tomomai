import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const PLACEHOLDER = "__TOMOMAI_API_BASE__";
const CLIENT_ID_PLACEHOLDER = "__TOMOMAI_USERSCRIPT_CLIENT_ID__";

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
    tailwindcss(),
    react(),
    monkey({
      entry: "src/main.tsx",
      userscript: {
        name: "tomomai",
        namespace: "https://tomomai.lol",
        version,
        description: "tomomai userscript for maimaidx",
        match: [
          "https://maimaidx.jp/*",
          "https://maimaidx-eng.com/*",
        ],
        grant: ["GM_addStyle", "GM_getValue", "GM_setValue", "GM_xmlhttpRequest"],
        connect: ["tomomai.lol", "localhost"],
        updateURL: `${PLACEHOLDER}/userscript.user.js`,
        downloadURL: `${PLACEHOLDER}/userscript.user.js`,
        "run-at": "document-idle",
      },
    }),
  ],
});
