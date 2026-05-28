import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const PLACEHOLDER = "__TOMOMAI_API_BASE__";
const CLIENT_ID_PLACEHOLDER = "__TOMOMAI_USERSCRIPT_CLIENT_ID__";

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
        version: "0.0.1",
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
