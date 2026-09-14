import nextConfig from "eslint-config-next";

const config = [
  { ignores: ["**/dist/**", "**/.next/**"] },
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
];

export default config;
