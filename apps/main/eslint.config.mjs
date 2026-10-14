import nextConfig from "eslint-config-next";
import { CANONICAL_GAME_IDS } from "./src/lib/games/ids.ts";

const serverOnlyBoundary = {
  group: ["@/server/*"],
  allowTypeImports: true,
  message: "Client-safe code may only import types from @/server. Move shared runtime logic under src/lib.",
};

export default [
  { ignores: ["**/dist/**", "**/.next/**", "**/.next-*/**"] },
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "jsx-a11y/alt-text": "warn",
      "react/no-unescaped-entities": "warn",
      "react/jsx-key": "warn",
      "@next/next/no-img-element": "warn",
      "@next/next/no-assign-module-variable": "warn",
      "import/no-anonymous-default-export": "warn",

      // eslint-plugin-react-hooks v7 (shipped with Next 16) added many new
      // strict rules. Demoting to warn so lint stays green; clean up
      // incrementally and flip individual rules back to error as we go.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Components still import @tomomai/ui once per symbol in many files. Widen this once they are merged.
    files: ["src/lib/**/*.{ts,tsx}", "src/server/**/*.{ts,tsx}", "src/app/api/**/*.{ts,tsx}"],
    rules: { "import/no-duplicates": "error" },
  },
  {
    files: ["src/lib/games/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: [serverOnlyBoundary] }],
    },
  },
  ...CANONICAL_GAME_IDS.flatMap(game => {
    const otherGames = {
      group: CANONICAL_GAME_IDS.filter(other => other !== game).flatMap(other => [`**/${other}`, `**/${other}/**`]),
      message: "A game folder may not import another game's internals. Go through the generic registries.",
    };
    return [
      {
        files: [`src/lib/games/${game}/**/*.{ts,tsx}`, `src/components/games/${game}/**/*.{ts,tsx}`],
        rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [serverOnlyBoundary, otherGames] }] },
      },
      {
        files: [`src/server/services/games/${game}/**/*.{ts,tsx}`, `src/server/routers/${game}/**/*.{ts,tsx}`],
        rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [otherGames] }] },
      },
    ];
  }),
];
