# How to add a feature flag

All feature flags live in `src/lib/flags.ts` and are powered by `flags/next` (Vercel's Flags SDK). Flags are exposed via the discovery endpoint at `src/app/.well-known/vercel/flags/route.ts`, which auto-detects every exported `flag<boolean>(...)` from `flags.ts`.

## Steps

To add a new flag, touch three spots in `src/lib/flags.ts`:

1. Add the key to the `Flags` interface.
2. Add an entry to `registry` (`defaultValue`, `userSelectable`, `decide`).
3. Export a named `use<Name>` alias from `registry.<name>.fn`.

`flagDefinitions`, `defaultFlags`, and `useFlags0` are all derived from `registry` automatically — no manual sync needed.

## Field reference

| Field | Meaning |
| --- | --- |
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

// 2. registry entry
aprilFools2026: defineFlag("aprilFools2026", {
  defaultValue: false,
  userSelectable: true,
  decide: async () => isAprilFools2026JST(),
}),

// 3. Named export (required for Vercel Flags SDK discovery)
export const useAprilFools2026 = registry.aprilFools2026.fn;
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
