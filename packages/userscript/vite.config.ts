import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
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
        grant: ["GM_addStyle"],
        updateURL: "https://tomomai.lol/userscript.user.js",
        downloadURL: "https://tomomai.lol/userscript.user.js",
        "run-at": "document-idle",
      },
    }),
  ],
});
