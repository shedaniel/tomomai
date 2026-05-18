import { readFileSync, writeFileSync } from "fs";
import { defineConfig } from "tsup";

const external = [
  "react",
  "react-dom",
  /^@radix-ui/,
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "motion",
  "lucide-react",
  "sonner",
  "vaul",
  "recharts",
  "embla-carousel-react",
  "react-hook-form",
  "radix-ui",
  "web-haptics",
];

const esbuildOptions = (options: any) => {
  options.jsx = "automatic";
  options.target = "es2022";
};

// Files that must have "use client" at the top so Next.js App Router
// treats them as client-only bundles.
const CLIENT_ENTRIES = ["dist/index.js", "dist/select-friendly.js"];

export default defineConfig([
  // Pure utilities — no React, no "use client" needed
  {
    entry: {
      utils: "src/utils.ts",
      "animation-constants": "src/animation-constants.ts",
      themes: "src/themes.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external,
    treeshake: true,
    esbuildOptions,
  },
  // React component bundles
  {
    entry: {
      index: "src/index.ts",
      "select-friendly": "src/components/select-friendly.tsx",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    external,
    treeshake: true,
    esbuildOptions,
    async onSuccess() {
      for (const file of CLIENT_ENTRIES) {
        const content = readFileSync(file, "utf-8");
        if (!content.startsWith('"use client"')) {
          writeFileSync(file, '"use client";\n' + content);
        }
      }
    },
  },
]);
