import nextConfig from "eslint-config-next";

const config = [
  { ignores: ["**/dist/**", "**/.next/**", "**/drizzle-pg/**"] },
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "import/no-anonymous-default-export": "warn",
    },
  },
];

export default config;
