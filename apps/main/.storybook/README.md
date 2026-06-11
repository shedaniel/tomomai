# Storybook

Single Storybook for the whole frontend, built with `@storybook/nextjs-vite` so
it reuses the app's `next.config.ts` (next-intl plugin, `transpilePackages`, the
`@/*` alias), Tailwind v4 pipeline, and providers.

```bash
pnpm --filter @tomomai/site storybook        # dev server on :6006
pnpm --filter @tomomai/site build-storybook   # static build -> storybook-static/
```

## What's covered

- **`UI/*`** — every component in `@tomomai/ui` (`packages/ui/src/components`).
  Stories are co-located next to each component. These render purely under the
  global providers; no data mocking needed.
- **`Main/*`** — selected `apps/main` components. These are coupled to tRPC and
  next-intl, so they need the mocking patterns below.

## Global setup (`.storybook/preview.tsx`)

Every story is wrapped in:

- `NextIntlClientProvider` with the `en` messages, so `useTranslations()` works.
- A tRPC + React Query provider (`retry: false`) using the app's real client.
- A light/dark theme toggle (`@storybook/addon-themes`) that toggles `.dark` on
  `<html>`, matching `globals.css`.
- MSW (`msw-storybook-addon`), started with `onUnhandledRequest: "bypass"`.

## Mocking tRPC data

Use the `mockTrpc` helper (`.storybook/trpc-msw.ts`). Map fully-qualified
procedure names to plain JSON-safe fixtures:

```tsx
import { mockTrpc } from "../../.storybook/trpc-msw";

export const WithData: Story = {
  parameters: {
    msw: {
      handlers: [
        mockTrpc({
          "user.getStats": { plays: 1234, rating: 15021 },
        }),
      ],
    },
  },
};
```

Notes:

- Fixtures must be JSON-safe (no `Date`/`Map`/`Set`) — the helper omits superjson
  `meta`. If you need richer types, extend `trpc-msw.ts`.
- A procedure with no mock resolves to a tRPC `NOT_FOUND` error, which surfaces
  the missing key clearly in the component's error state.
- Mutations work the same way (same batched endpoint).

## Other locales

The global provider pins `en`. To preview another locale, wrap the story's
`render` in its own `NextIntlClientProvider` with the desired messages, or extend
`preview.tsx` with a locale toolbar global.
