import * as React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { initialize, mswLoader } from "msw-storybook-addon";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import { trpc, trpcClient } from "@/lib/trpc-client";

// The app's exact Tailwind v4 entry: tokens, @source globs and the dark variant
// all come from here unchanged, so stories render with real styling.
import "../src/app/globals.css";
// Storybook-only font fallbacks (next/font doesn't run here).
import "./storybook.css";
import enMessages from "../messages/en.json";

// Start the MSW worker. `bypass` lets unmocked requests (fonts, images, etc.)
// hit the network instead of erroring.
initialize({ onUnhandledRequest: "bypass" });

/** Wraps every story in the same providers the app mounts at the root. */
function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 60 * 1000,
            queryKeyHashFn: superjson.stringify,
          },
        },
      }),
  );

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </NextIntlClientProvider>
  );
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Stories opt in to data by setting `parameters.msw.handlers`.
    msw: { handlers: [] },
  },
  loaders: [mswLoader],
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
