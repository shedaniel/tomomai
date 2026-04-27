# How to add a feature flag

All feature flags live in `src/lib/flags.ts` and are powered by `flags/next` (Vercel's Flags SDK). Flags are exposed via the discovery endpoint at `src/app/.well-known/vercel/flags/route.ts`, which auto-detects every exported `flag<boolean>(...)` from `flags.ts`.

## Steps

To add a new flag, touch four spots in `src/lib/flags.ts`:

1. Add the key to the `Flags` interface.
2. Add an `await use<Name>()` line to `useFlags0()`.
3. Add an entry to `flagDefinitions` (`key`, `defaultValue`, `userSelectable`, `decide`).
4. Export a `use<Name>` flag created with `flag<boolean>({ ... })`.

The `decide()` in `flagDefinitions` and the `decide()` in the exported `flag<boolean>(...)` should return the same value — keep them in sync.

## Field reference

| Field | Meaning |
| --- | --- |
| `key` | Stable string identifier. Must match the property name on `Flags`. |
| `defaultValue` | Value returned when no override is set and `decide()` is unreachable. |
| `userSelectable` | If `true`, the flag can be overridden via the `flagOverrides` cookie (see `applyFlagOverrides`). Non-user-selectable flags ignore overrides. |
| `decide()` | Async function evaluated server-side per request. Use this to gate on time, env, user identity, etc. |

## Worked example: `aprilFools2026`

Goal: a flag that turns on April Fools 2026 behaviour, mirroring `isAprilFools2026JST()` from `src/lib/april-fools.ts`.

```ts
// 1. Flags interface
export interface Flags {
  // ...
  aprilFools2026: boolean;
}

// 2. useFlags0
aprilFools2026: await useAprilFools2026(),

// 3. flagDefinitions
aprilFools2026: {
  key: "aprilFools2026",
  defaultValue: false,
  userSelectable: true,
  decide: async () => isAprilFools2026JST(),
},

// 4. Exported flag
export const useAprilFools2026 = flag<boolean>({
  key: "aprilFools2026",
  defaultValue: false,
  async decide() {
    return isAprilFools2026JST();
  },
});
```

## Reading flags at runtime

- In a server component / route: `const flags = await useFlags(cookies);`. This calls `useFlags0()` and applies cookie overrides for user-selectable flags.
- To read a single flag without overrides: `await useAprilFools2026()`.

## User overrides

Set the `flagOverrides` cookie to a JSON object, e.g.

```json
{ "aprilFools2026": true }
```

Only flags with `userSelectable: true` honour overrides.
