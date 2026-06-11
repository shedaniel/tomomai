import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  // Main-app stories live alongside the app; the shared @tomomai/ui library
  // stories live in the package and are picked up here so a single Storybook
  // covers both surfaces.
  stories: [
    "../src/**/*.stories.@(ts|tsx|mdx)",
    "../../../packages/ui/src/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  // Allow the dev server to be reached through a tunnel (cloudflared / ngrok).
  // Storybook's core server (and Vite) reject unknown Host headers with a 403
  // "Invalid host" otherwise. `true` allows any host — fine for a temporary
  // preview tunnel; tighten to specific hostnames if you expose it for longer.
  core: { allowedHosts: true },
  viteFinal: async (config) => {
    config.server = { ...config.server, allowedHosts: true };
    return config;
  },
};

export default config;
